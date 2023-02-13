const { expect } = require("chai");
import { addressBook } from "../../../beefy-api/packages/address-book/build/address-book";
import { ethers, network } from "hardhat";
import { chainCallFeeMap } from "../../utils/chainCallFeeMap";

const { zapNativeToToken, getVaultWant, unpauseIfPaused, getUnirouterData } = require("../../utils/testHelpers");
const { delay } = require("../../utils/timeHelpers");

const TIMEOUT = 10 * 60 * 1000000;

const chainName = "fantom";
const chainData = addressBook[chainName];
const { beefyfinance } = chainData.platforms;
const { beethovenx } = chainData.platforms;

const config = {
  vault: "0x79d9Db6324Be46B337E5846bD00d8e3071865605",
  beetsVault: "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce",
  vaultContract: "BeefyVaultV6",
  strategyContract: "contracts/BIFI/flattened.sol:StrategyBalancerMultiRewardChefUniV2",
  testAmount: ethers.utils.parseEther("5"),
  wnative: chainData.tokens.WNATIVE.address,
  keeper: beefyfinance.keeper,
};

describe("beetsVaultLifecycleTest", () => {
  let vault, strategy, unirouter, want, deployer, keeper, other;

  beforeEach(async () => {
    [deployer, keeper, other] = await ethers.getSigners();

    // Wrap native
    const wnative = await ethers.getContractAt(
      "contracts/BIFI/interfaces/common/IWrappedNative.sol:IWrappedNative",
      config.wnative
    );
    await wnative.deposit({ value: config.testAmount });

    vault = await ethers.getContractAt(config.vaultContract, config.vault);
    const strategyAddr = await vault.strategy();
    strategy = await ethers.getContractAt(config.strategyContract, strategyAddr);

    const input = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", config.wnative);

    const inputBal = await input.balanceOf(deployer.address);
    const wantVault = await ethers.getContractAt(
      "contracts/BIFI/interfaces/beethovenx/IBalancerVault.sol:IBalancerVault",
      config.beetsVault
    );

    const wantPoolId = "0x56ad84b777ff732de69e85813daee1393a9ffe1000020000000000000000060e";

    const lpTokens = await wantVault.getPoolTokens(wantPoolId);
    const poolInfo = await wantVault.getPool(wantPoolId);

    const wantAddr = poolInfo[0];
    want = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", wantAddr);
    // console.log("poolInfo:", poolInfo);
    // console.log("wantAddr:", wantAddr);
    // console.log("wantPoolId:", wantPoolId);
    // console.log("deployer.address:", deployer.address);
    // console.log("lpTokens.tokens:", lpTokens.tokens);
    // console.log("inputBal:", inputBal);

    const abiCoder = new ethers.utils.AbiCoder();
    // userData: 1=EXACT_TOKENS_IN_FOR_BPT_OUT, tokensIn, minBPTOut
    const userData = abiCoder.encode(["uint256", "uint256[]", "uint256"], [1, [0, inputBal], 1]);
    const userDataObj = [1, [0, inputBal], 1];
    // console.log("userData:", userData);

    await input.approve(config.beetsVault, ethers.constants.MaxUint256);

    let tx = await wantVault.joinPool(
      wantPoolId,
      deployer.address,
      deployer.address,
      [lpTokens.tokens, [0, inputBal], userData, false]
      // ethers.utils.arrayify(joinPoolRequest)
    );
    // console.log("tx:", tx);
    let wantBal = await want.balanceOf(deployer.address);
    await want.transfer(other.address, wantBal.div(2));
    wantBal = await want.balanceOf(deployer.address);
    let otherBal = await want.balanceOf(other.address);
    // console.log("deployer wantBal:", wantBal);
    // console.log("other wantBal:", otherBal);
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
    await network.provider.send("evm_increaseTime", [60 * 60 * 1]); // 1 hour
    await network.provider.send("evm_mine");
    await delay(5000);
    // const callRewardBeforeHarvest = await strategy.callReward();
    // expect(callRewardBeforeHarvest).to.be.gt(0);
    await strategy.managerHarvest();
    const vaultBalAfterHarvest = await vault.balance();
    const pricePerShareAfterHarvest = await vault.getPricePerFullShare();
    // const callRewardAfterHarvest = await strategy.callReward();

    await vault.withdrawAll();
    const wantBalFinal = await want.balanceOf(deployer.address);

    expect(vaultBalAfterHarvest).to.be.gt(vaultBal);
    expect(pricePerShareAfterHarvest).to.be.gt(pricePerShare);
    // expect(callRewardBeforeHarvest).to.be.gt(callRewardAfterHarvest);

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

  it.skip("Has correct call fee", async () => {
    const callFee = await strategy.callFee();

    const expectedCallFee = chainCallFeeMap[chainName];
    const actualCallFee = parseInt(callFee);

    expect(actualCallFee).to.equal(expectedCallFee);
  }).timeout(TIMEOUT);

  it.skip("has withdraw fee of 0 if harvest on deposit is true", async () => {
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
