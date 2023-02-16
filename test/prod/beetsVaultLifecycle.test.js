const { expect } = require("chai");
import { addressBook } from "../../../beefy-api/packages/address-book/build/address-book";
import { ethers } from "hardhat";
import { chainCallFeeMap } from "../../utils/chainCallFeeMap";
import { ChefManager__factory } from "../../typechain-types";

const { zapNativeToToken, getVaultWant, unpauseIfPaused, getUnirouterData } = require("../../utils/testHelpers");
const { delay } = require("../../utils/timeHelpers");

const TIMEOUT = 10 * 60 * 1000000;

const chainName = "fantom";
const chainData = addressBook[chainName];
const { beefyfinance } = chainData.platforms;
const { beethovenx } = chainData.platforms;

const config = {
  vault: "0x70b14a13640ed15d47AB0151BDFeEE09c1186896",
  beetsVault: "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce",
  vaultContract: "BeefyVaultV6",
  strategyContract: "StrategyBeethovenx",
  testAmount: ethers.utils.parseEther("5"),
  wnative: chainData.tokens.WNATIVE.address,
  keeper: beefyfinance.keeper,
  //   strategyOwner: beefyfinance.strategyOwner,
  //   vaultOwner: beefyfinance.vaultOwner,
};

describe("beetsVaultLifecycleTest", () => {
  let vault, strategy, unirouter, want, deployer, keeper, other;

  beforeEach(async () => {
    [deployer, keeper, other] = await ethers.getSigners();
    vault = await ethers.getContractAt(config.vaultContract, config.vault);
    const strategyAddr = await vault.strategy();
    console.log({ strategyAddr });
    strategy = await ethers.getContractAt(config.strategyContract, strategyAddr);
    const unirouterAddr = "0xF491e7B69E4244ad4002BC14e878a34207E38c29";
    console.log({ unirouterAddr });
    const unirouterData = getUnirouterData(unirouterAddr);
    console.log({ unirouterData });
    unirouter = await ethers.getContractAt(unirouterData.interface, unirouterAddr);
    want = await vault.want();
    console.log({ want });
    const inputAddr = await strategy.input();
    const input = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", inputAddr);
    const wantPoolId = await strategy.wantPoolId();

    await zapNativeToToken({
      amount: config.testAmount,
      want: input,
      nativeTokenAddr: config.wnative,
      unirouter,
      swapSignature: unirouterData.swapSignature,
      recipient: deployer.address,
    });

    const inputBal = await input.balanceOf(deployer.address);
    const wantVault = await ethers.getContractAt("IBalancerVault", config.beetsVault);
    const lpTokens = await wantVault.getPoolTokens(wantPoolId);
    const abiCoder = new ethers.utils.AbiCoder();
    const callData = abiCoder.encode(
      ["bytes32", "address", "address", ["address[]", "uint256[]", "bytes", "bool"]],
      [wantPoolId, deployer.address, deployer.address, [lpTokens, [inputBal, 0], false]]
    );
    wantVault.joinPool(callData);

    const wantBal = await want.balanceOf(deployer.address);
    await want.transfer(other.address, wantBal.div(2));
    await unpauseIfPaused(strategy, deployer);
  });

  it("User can deposit and withdraw from the vault.", async () => {
    const wantBalStart = await want.balanceOf(deployer.address);

    await want.approve(vault.address, wantBalStart);
    await vault.depositAll();
    const wantBalVault = await vault.balanceOf(deployer.address);
    await vault.withdrawAll();

    const wantBalFinal = await want.balanceOf(deployer.address);

    expect(wantBalVault).to.be.gt(0);
    expect(wantBalFinal).to.be.lte(wantBalStart);
    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));
  }).timeout(TIMEOUT);

  it("Harvests work as expected.", async () => {
    const wantBalStart = await want.balanceOf(deployer.address);
    await want.approve(vault.address, wantBalStart);
    await vault.depositAll();

    const vaultBal = await vault.balance();
    const pricePerShare = await vault.getPricePerFullShare();
    await delay(5000);
    const callRewardBeforeHarvest = await strategy.callReward();
    expect(callRewardBeforeHarvest).to.be.gt(0);
    await strategy.managerHarvest();
    const vaultBalAfterHarvest = await vault.balance();
    const pricePerShareAfterHarvest = await vault.getPricePerFullShare();
    const callRewardAfterHarvest = await strategy.callReward();

    await vault.withdrawAll();
    const wantBalFinal = await want.balanceOf(deployer.address);

    expect(vaultBalAfterHarvest).to.be.gt(vaultBal);
    expect(pricePerShareAfterHarvest).to.be.gt(pricePerShare);
    expect(callRewardBeforeHarvest).to.be.gt(callRewardAfterHarvest);

    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));

    const lastHarvest = await strategy.lastHarvest();
    expect(lastHarvest).to.be.gt(0);
  }).timeout(TIMEOUT);

  it("Manager can panic.", async () => {
    const wantBalStart = await want.balanceOf(deployer.address);
    await want.approve(vault.address, wantBalStart);
    await vault.deposit(wantBalStart.div(2));

    const vaultBal = await vault.balance();
    const balOfPool = await strategy.balanceOfPool();
    const balOfWant = await strategy.balanceOfWant();
    await strategy.panic();
    const vaultBalAfterPanic = await vault.balance();
    const balOfPoolAfterPanic = await strategy.balanceOfPool();
    const balOfWantAfterPanic = await strategy.balanceOfWant();

    expect(vaultBalAfterPanic).to.be.gt(vaultBal.mul(99).div(100));
    expect(balOfPool).to.be.gt(balOfWant);
    expect(balOfWantAfterPanic).to.be.gt(balOfPoolAfterPanic);

    // Users can't deposit.
    await expect(vault.depositAll()).to.be.reverted;

    // User can still withdraw
    await vault.withdrawAll();
    const wantBalFinal = await want.balanceOf(deployer.address);
    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));
  }).timeout(TIMEOUT);

  it("New user deposit/withdrawals don't lower other users balances.", async () => {
    const wantBalStart = await want.balanceOf(deployer.address);
    await want.approve(vault.address, wantBalStart);
    await vault.depositAll();

    const pricePerShare = await vault.getPricePerFullShare();
    const wantBalOfOther = await want.balanceOf(other.address);
    await want.connect(other).approve(vault.address, wantBalOfOther);
    await vault.connect(other).depositAll();
    const pricePerShareAfterOtherDeposit = await vault.getPricePerFullShare();

    await vault.withdrawAll();
    const wantBalFinal = await want.balanceOf(deployer.address);
    const pricePerShareAfterWithdraw = await vault.getPricePerFullShare();

    expect(pricePerShareAfterOtherDeposit).to.be.gte(pricePerShare);
    expect(pricePerShareAfterWithdraw).to.be.gte(pricePerShareAfterOtherDeposit);
    expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));
  }).timeout(TIMEOUT);

  it.skip("It has the correct owners and keeper.", async () => {
    const vaultOwner = await vault.owner();
    const stratOwner = await strategy.owner();
    const stratKeeper = await strategy.keeper();

    expect(vaultOwner).to.equal(deployer.address);
    expect(stratOwner).to.equal(deployer.address);
    expect(stratKeeper).to.equal(keeper.address);
  }).timeout(TIMEOUT);

  it("Vault and strat references are correct", async () => {
    const stratReference = await vault.strategy();
    const vaultReference = await strategy.vault();

    expect(stratReference).to.equal(ethers.utils.getAddress(strategy.address));
    expect(vaultReference).to.equal(ethers.utils.getAddress(vault.address));
  }).timeout(TIMEOUT);

  it("Displays routing correctly", async () => {
    const { tokenAddressMap } = addressBook[chainName];

    // nativeToLp0Route
    console.log("nativeToLp0Route:");
    for (let i = 0; i < 10; ++i) {
      try {
        const tokenAddress = await strategy.outputToLp0Route(i);
        if (tokenAddress in tokenAddressMap) {
          console.log(tokenAddressMap[tokenAddress].symbol);
        } else {
          console.log(tokenAddress);
        }
      } catch {
        // reached end
        if (i == 0) {
          console.log("No routing, output must be lp0");
        }
        break;
      }
    }

    // nativeToLp1Route
    console.log("nativeToLp1Route:");
    for (let i = 0; i < 10; ++i) {
      try {
        const tokenAddress = await strategy.outputToLp1Route(i);
        if (tokenAddress in tokenAddressMap) {
          console.log(tokenAddressMap[tokenAddress].symbol);
        } else {
          console.log(tokenAddress);
        }
      } catch {
        // reached end
        if (i == 0) {
          console.log("No routing, output must be lp1");
        }
        break;
      }
    }
  }).timeout(TIMEOUT);

  it("Has correct call fee", async () => {
    const callFee = await strategy.callFee();

    const expectedCallFee = chainCallFeeMap[chainName];
    const actualCallFee = parseInt(callFee);

    expect(actualCallFee).to.equal(expectedCallFee);
  }).timeout(TIMEOUT);

  it("has withdraw fee of 0 if harvest on deposit is true", async () => {
    const harvestOnDeposit = await strategy.harvestOnDeposit();

    const withdrawalFee = await strategy.withdrawalFee();
    const actualWithdrawalFee = parseInt(withdrawalFee);
    if (harvestOnDeposit) {
      expect(actualWithdrawalFee).to.equal(0);
    } else {
      expect(actualWithdrawalFee).not.to.equal(0);
    }
  }).timeout(TIMEOUT);
});