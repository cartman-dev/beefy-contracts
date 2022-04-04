const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");

const { addressBook } = require("blockchain-addressbook");
const { deployStaker } = require("../../utils/deployStaker");
const { deployVault } = require("../../utils/deployVault");
const { delay, nowInSeconds } = require("../../utils/timeHelpers");
const { chainCallFeeMap } = require("../../utils/chainCallFeeMap");

const {
  zapNativeToToken,
  getVaultWant,
  unpauseIfPaused,
  getUnirouterData,
  swapNativeForToken,
} = require("../../utils/testHelpers");

// TOKENS
const JOE = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
const VEJOE = "0x3cabf341943Bc8466245e4d6F1ae0f8D071a1456";
const USDC_AVAX_LP = "0xf4003f4efbe8691b60249e6afbd307abe7758adb";
const USDTE_AVAX_LP = "0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256";
const USDC_AVAX_PID = 0;
const USDTE_AVAX_PID = 1;
const USDC = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
const USDTE = "0xc7198437980c041c805A1EDcbA50c1Ce5db95118";
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

// SCs
const VEJOE_STAKING = "0x25D85E17dD9e544F6E9F8D44F99602dbF5a97341";
const BOOSTEDMASTERCHEF = "0x4483f0b6e2F5486D06958C20f8C39A7aBe87bf8F";
const UNIROUTER = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4";
const JOEVAULT = "0x282B11E65f0B49363D4505F91c7A44fBEe6bCc0b";

// OTHER ADDRESSES
const KEEPER = "0x340465d9D2EbDE78F15a3870884757584F97aBB4";
const STRATEGIST = "0x6453bD91C3B06DCC24F588FFfa384b0EEB0178B3";
const BEEFYFEERECIPIENT = "0x8Ef7C232470f85Af0809ce5E43888F989eFcAF47";
const VAULTOWNER = "0x690216f462615b749bEEB5AA3f1d89a2BEc45Ecf";
const STRATOWNER = "0x37DC61A76113E7840d4A8F1c1B799cC9ac5Aa854";

// CONFIG
const TIMEOUT = 10 * 60 * 1000;
const RPC = "http://127.0.0.1:8545";
const AMOUNT = ethers.BigNumber.from("5000000000000000000000");
const NETWORK = "avax";

// Error Codes
const OWNABLE_ERROR = "Ownable: caller is not the owner";
const PAUSED_ERROR = "Pausable: paused";

function fmt(n, p = 4) {
  return Number(n / 1e18).toFixed(p);
}

describe("VeJoeArch", async () => {
  let vault, strategy, config, impl, staker, unirouter, want, deployer, keeper, other, abis, contracts;

  before(async () => {
    [deployer, keeper, other] = await ethers.getSigners();
  });

  const setup = async () => {
    const abis = {
      erc20: await artifacts.readArtifact("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20"),
      chef: await artifacts.readArtifact("IBoostedMasterChef"),
      veStaking: await artifacts.readArtifact("IVeWantStaking"),
      veToken: await artifacts.readArtifact("contracts/BIFI/interfaces/common/boost/IVeWant.sol:IVeWant"),
      router: await artifacts.readArtifact("IUniswapRouterAVAX"),
    };

    const contracts = {
      joe: await ethers.getContractAt(abis.erc20.abi, JOE),
      veJoe: await ethers.getContractAt(abis.veToken.abi, VEJOE),
      veJoeStaking: await ethers.getContractAt(abis.veStaking.abi, VEJOE_STAKING),
      chef: await ethers.getContractAt(abis.chef.abi, BOOSTEDMASTERCHEF),
      router: await ethers.getContractAt(abis.router.abi, UNIROUTER),
    };

    return { abis, contracts };
  };

  const StakerArch = async ({ signer }) => {
    const { impl, staker } = await deployStaker({
      staker: "VeJoeStaker",
      stakerParams: {
        veWantStaking: VEJOE_STAKING,
        keeper: KEEPER,
        chef: BOOSTEDMASTERCHEF,
        joeVault: JOEVAULT,
        name: "Beefy Escrowed JOE",
        symbol: "beJOE",
      },
      signer: signer,
    });
    return { impl, staker };
  };

  const FirstVault = async ({ signer, stakerAddr }) => {
    const config = {
      vault: "BeefyVaultV6",
      strategy: "StrategyTraderJoeBoostedLP",
      want: USDC_AVAX_LP,
      mooName: "Moo Joe USDC-AVAX",
      mooSymbol: "mooJoeUSDC-AVAX",
      delay: 60,
      strategyParams: {
        want: USDC_AVAX_LP,
        poolId: USDC_AVAX_PID,
        chef: BOOSTEDMASTERCHEF,
        staker: stakerAddr,
        unirouter: UNIROUTER,
        keeper: KEEPER,
        strategist: STRATEGIST,
        beefyFeeRecipient: BEEFYFEERECIPIENT,
        outputToNativeRoute: [JOE, WAVAX],
        secondOutputToNativeRoute: [WAVAX],
        nativeToLp0Route: [WAVAX],
        nativeToLp1Route: [USDC],
      },
      signer: signer,
      rpc: RPC,
    };

    const { vault, strategy } = await deployVault(config);
    return { vault, strategy, config };
  };

  const SecondVault = async ({ signer, stakerAddr }) => {
    const config = {
      vault: "BeefyVaultV6",
      strategy: "StrategyTraderJoeBoostedLP",
      want: USDTE_AVAX_LP,
      mooName: "Moo Joe USDT.e-AVAX",
      mooSymbol: "mooJoeUSDT.e-AVAX",
      delay: 60,
      strategyParams: {
        want: USDTE_AVAX_LP,
        poolId: USDTE_AVAX_PID,
        chef: BOOSTEDMASTERCHEF,
        staker: stakerAddr,
        unirouter: UNIROUTER,
        keeper: KEEPER,
        strategist: STRATEGIST,
        beefyFeeRecipient: BEEFYFEERECIPIENT,
        outputToNativeRoute: [JOE, WAVAX],
        secondOutputToNativeRoute: [WAVAX],
        nativeToLp0Route: [WAVAX],
        nativeToLp1Route: [WAVAX, USDTE],
      },
      signer: signer,
      rpc: RPC,
    };

    const { vault, strategy } = await deployVault(config);
    return { vault, strategy, config };
  };

  describe("VeJoeManager", async () => {
    let vault1, vault2;
    let impl, staker, unirouter, deployer, keeper, other;

    before(async () => {
      [deployer, keeper, other] = await ethers.getSigners();
      ({ impl, staker } = await StakerArch({ signer: deployer }));
      await staker.setKeeper(keeper.address);
      vault1 = await FirstVault({ signer: deployer, stakerAddr: staker.address });
      vault2 = await SecondVault({ signer: deployer, stakerAddr: staker.address });
      await setupStrategyOnce({ strategy: vault1.strategy, keeper, config: vault1.config });
      await setupStrategyOnce({ strategy: vault2.strategy, keeper, config: vault2.config });

      ({ want: vault1.want } = await setupStrategyEach({
        strategy: vault1.strategy,
        vault: vault1.vault,
        unirouter,
        deployer,
        keeper,
        other,
      }));

      ({ want: vault2.want } = await setupStrategyEach({
        strategy: vault2.strategy,
        vault: vault2.vault,
        unirouter,
        deployer,
        keeper,
        other,
      }));
    });

    describe("setChef", async () => {
      let impl, staker, deployer, keeper, other;
      beforeEach(async () => {
        [deployer, keeper, other] = await ethers.getSigners();
        ({ impl, staker } = await StakerArch({ signer: deployer }));
      });
      it("owner can change", async () => {
        const before = await staker.chef();
        await staker.setChef(UNIROUTER);
        const after = await staker.chef();
        expect(after).not.to.equal(before);
        expect(after).to.be.equal(UNIROUTER);
      }).timeout(TIMEOUT);

      it("keeper can't change", async () => {
        const before = await staker.chef();
        await expect(staker.connect(keeper).setChef(UNIROUTER)).to.be.revertedWith("Ownable: caller is not the owner");
        const after = await staker.chef();
        expect(before).to.be.equal(after);
      }).timeout(TIMEOUT);

      it("other can't change", async () => {
        const before = await staker.chef();
        await expect(staker.connect(other).setChef(UNIROUTER)).to.be.revertedWith("Ownable: caller is not the owner");
        const after = await staker.chef();
        expect(before).to.be.equal(after);
      }).timeout(TIMEOUT);
    });

    describe("setKeeper", async () => {
      let impl, staker, deployer, keeper, other;
      beforeEach(async () => {
        [deployer, keeper, other] = await ethers.getSigners();
        ({ impl, staker } = await StakerArch({ signer: deployer }));
        await staker.setKeeper(keeper.address);
      });
      it("owner can change", async () => {
        const before = await staker.keeper();
        await staker.setKeeper(other.address);
        const after = await staker.keeper();
        expect(after).not.to.equal(before);
        expect(after).to.be.equal(other.address);
      }).timeout(TIMEOUT);

      it("keeper can change", async () => {
        const before = await staker.keeper();
        await staker.connect(keeper).setKeeper(other.address);
        const after = await staker.keeper();
        expect(after).not.to.equal(before);
        expect(after).to.be.equal(other.address);
      }).timeout(TIMEOUT);

      it("other can't change", async () => {
        const before = await staker.keeper();
        await expect(staker.connect(other).setKeeper(UNIROUTER)).to.be.revertedWith("!manager");
        const after = await staker.keeper();
        expect(before).to.be.equal(after);
      }).timeout(TIMEOUT);
    });

    describe("whitelist", async () => {
      it("starts empty", async () => {
        const wantBalStart = await vault1.want.balanceOf(deployer.address);
        await vault1.want.approve(vault1.vault.address, wantBalStart);
        console.log(`deployer balance: ${wantBalStart}`);
        await expect(vault1.vault.depositAll()).to.be.revertedWith("!whitelist");
        const wantBalEnd = await vault1.want.balanceOf(deployer.address);
        expect(wantBalEnd).to.be.equal(wantBalStart);
        const allowance = await vault1.want.allowance(staker.address, BOOSTEDMASTERCHEF);
        expect(allowance).to.equal(0);
      }).timeout(TIMEOUT);
      it("other can't whitelist", async () => {
        await expect(staker.connect(other).whitelistStrategy(vault1.strategy.address)).to.be.revertedWith("!manager");
        const allowance = await vault1.want.allowance(staker.address, BOOSTEDMASTERCHEF);
        expect(allowance).to.equal(0);
      }).timeout(TIMEOUT);
      it("keeper can whitelist", async () => {
        await expect(staker.connect(keeper).whitelistStrategy(vault1.strategy.address)).not.to.be.reverted;
        const allowance = await vault1.want.allowance(staker.address, BOOSTEDMASTERCHEF);
        expect(allowance).not.to.equal(0);
      }).timeout(TIMEOUT);
      it("owner can whitelist", async () => {
        await expect(staker.whitelistStrategy(vault2.strategy.address)).not.to.be.reverted;
        const allowance = await vault2.want.allowance(staker.address, BOOSTEDMASTERCHEF);
        expect(allowance).not.to.equal(0);
      }).timeout(TIMEOUT);
      it("other can't blacklist", async () => {
        await expect(staker.connect(other).blacklistStrategy(vault1.strategy.address)).to.be.revertedWith("!manager");
        const allowance = await vault1.want.allowance(staker.address, BOOSTEDMASTERCHEF);
        expect(allowance).not.to.equal(0);
      }).timeout(TIMEOUT);
      it("keeper can blacklist", async () => {
        await expect(staker.connect(keeper).blacklistStrategy(vault1.strategy.address)).not.to.be.reverted;
        const allowance = await vault1.want.allowance(staker.address, BOOSTEDMASTERCHEF);
        expect(allowance).to.equal(0);
      }).timeout(TIMEOUT);
      it("owner can blacklist", async () => {
        await expect(staker.blacklistStrategy(vault2.strategy.address)).not.to.be.reverted;
        const allowance = await vault2.want.allowance(staker.address, BOOSTEDMASTERCHEF);
        expect(allowance).to.equal(0);
      }).timeout(TIMEOUT);
      it("proposeStrategy", async () => {
        await expect(staker.whitelistStrategy(vault1.strategy.address)).not.to.be.reverted;
        const vault3 = await SecondVault({ signer: deployer, stakerAddr: staker.address });
        await setupStrategyOnce({ strategy: vault3.strategy, keeper, config: vault3.config });
        // valid proposed strategy: same poolId, chef
        await expect(staker.proposeStrategy(vault2.strategy.address, vault3.strategy.address)).not.to.be.reverted;
        // invalid proposed strategy: wrong poolId
        await expect(staker.proposeStrategy(vault3.strategy.address, vault1.strategy.address)).to.be.reverted;
      }).timeout(TIMEOUT);
    });
  });

  describe("VeJoeStaker", async () => {
    let vault, strategy, config, impl, staker, unirouter, want, deployer, keeper, other, abis, contracts;
    before(async () => {
      [deployer, keeper, other] = await ethers.getSigners();
      ({ abis, contracts } = await setup());
    });

    beforeEach(async () => {
      await swapNativeForToken({
        unirouter: contracts.router,
        amount: ethers.utils.parseEther("1"),
        nativeTokenAddr: WAVAX,
        token: contracts.joe,
        recipient: deployer.address,
        swapSignature: "swapExactAVAXForTokens",
      });
    });

    it("deploys", async () => {
      ({ impl, staker } = await StakerArch({ signer: deployer }));

      expect(await staker.symbol()).to.equal("beJOE");
      expect(impl).not.to.be.empty;
    }).timeout(TIMEOUT);

    it("view functions", async () => {
      const { impl, staker } = await StakerArch({ signer: deployer });

      expect(await staker.symbol()).to.equal("beJOE");
      expect(await staker.veWantStaking()).to.equal(VEJOE_STAKING);
      expect(await staker.keeper()).to.equal(KEEPER);
      expect(await staker.chef()).to.equal(BOOSTEDMASTERCHEF);
      expect(await staker.want()).to.equal(JOE);
      expect(await staker.veWant()).to.equal(VEJOE);
    }).timeout(TIMEOUT);

    it.only("deposits WANT", async () => {
      ({ abis, contracts } = await setup());
      const { impl, staker } = await StakerArch({ signer: deployer });

      const startBal = await contracts.joe.balanceOf(deployer.address);
      await contracts.joe.approve(staker.address, startBal);

      console.log("startBal:", startBal);
      const amount = startBal.div(2);
      console.log("amount:", amount);
      const startStakerBal = await staker.balanceOfWant();
      const startVeBal = await staker.balanceOfVe();

      await staker.depositAll();

      const endStakerBal = await staker.balanceOfWant();
      const endBal = await contracts.joe.balanceOf(deployer.address);
      await delay(5000);
      await staker.claimVeReward();
      const endVeBal = await staker.balanceOfVe();
      console.log("startVeBal:", startVeBal);
      console.log("endVeBal:", endVeBal);
      console.log("startStakerBal:", startStakerBal);
      console.log("endStakerBal:", endStakerBal);
      expect(endBal).to.be.lt(startBal);
    }).timeout(TIMEOUT);
  });

  describe("StrategyCommonChefBoostedLP", async () => {
    let vault, strategy, config, impl, staker, unirouter, want, deployer, keeper, other;

    before(async () => {
      [deployer, keeper, other] = await ethers.getSigners();
      ({ impl, staker } = await StakerArch({ signer: deployer }));
      ({ vault, strategy, config } = await FirstVault({ signer: deployer, stakerAddr: staker.address }));
      await setupStrategyOnce({ strategy, keeper, config });
      await staker.whitelistStrategy(strategy.address);
    });

    beforeEach(async () => {
      ({ want } = await setupStrategyEach({ strategy, vault, unirouter, deployer, keeper, other }));
    });

    it("User can deposit and withdraw from the vault.", async () => {
      const wantBalStart = await want.balanceOf(deployer.address);

      await want.approve(vault.address, wantBalStart);
      await vault.depositAll();
      await vault.withdrawAll();

      const wantBalFinal = await want.balanceOf(deployer.address);

      expect(wantBalFinal).to.be.lte(wantBalStart);
      expect(wantBalFinal).to.be.gt(wantBalStart.mul(99).div(100));
    }).timeout(TIMEOUT);

    it.skip("Harvests work as expected.", async () => {
      const wantBalStart = await want.balanceOf(deployer.address);
      await want.approve(vault.address, wantBalStart);
      await vault.depositAll();

      const vaultBal = await vault.balance();
      const pricePerShare = await vault.getPricePerFullShare();
      await delay(10000);
      const callRewardBeforeHarvest = await strategy.callReward();
      expect(callRewardBeforeHarvest).to.be.gt(0);
      await strategy.connect(keeper).managerHarvest();
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
      await vault.depositAll();

      const vaultBal = await vault.balance();
      const balOfPool = await strategy.balanceOfPool();
      const balOfWant = await strategy.balanceOfWant();
      await strategy.connect(keeper).panic();
      const vaultBalAfterPanic = await vault.balance();
      const balOfPoolAfterPanic = await strategy.balanceOfPool();
      const balOfWantAfterPanic = await strategy.balanceOfWant();

      expect(vaultBalAfterPanic).to.be.gt(vaultBal.mul(99).div(100));
      expect(balOfPool).to.be.gt(balOfWant);
      expect(balOfWantAfterPanic).to.be.gt(balOfPoolAfterPanic);

      // Users can't deposit.
      const tx = vault.depositAll();
      await expect(tx).to.be.revertedWith("Pausable: paused");

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

    it("It has the correct owners and keeper.", async () => {
      await vault.transferOwnership(VAULTOWNER);
      await strategy.setKeeper(KEEPER);
      await strategy.transferOwnership(STRATOWNER);

      const vaultOwner = await vault.owner();
      const stratOwner = await strategy.owner();
      const stratKeeper = await strategy.keeper();

      expect(vaultOwner).to.equal(VAULTOWNER);
      expect(stratOwner).to.equal(STRATOWNER);
      expect(stratKeeper).to.equal(KEEPER);
    }).timeout(TIMEOUT);

    it("Vault and strat references are correct", async () => {
      const stratReference = await vault.strategy();
      const vaultReference = await strategy.vault();

      expect(stratReference).to.equal(ethers.utils.getAddress(strategy.address));
      expect(vaultReference).to.equal(ethers.utils.getAddress(vault.address));
    }).timeout(TIMEOUT);

    it("Displays routing correctly", async () => {
      const { tokenAddressMap } = addressBook[NETWORK];

      // outputToLp0Route
      console.log("outputToLp0Route:");
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

      // outputToLp1Route
      console.log("outputToLp1Route:");
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

      const expectedCallFee = chainCallFeeMap[NETWORK];
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
});

const setupStrategyEach = async ({ strategy, vault, unirouter, deployer, keeper, other }) => {
  const unirouterAddr = await strategy.unirouter();
  const unirouterData = getUnirouterData(unirouterAddr);
  unirouter = await ethers.getContractAt(unirouterData.interface, unirouterAddr);
  const want = await getVaultWant(vault, WAVAX);

  await zapNativeToToken({
    amount: AMOUNT,
    want,
    nativeTokenAddr: WAVAX,
    unirouter,
    swapSignature: unirouterData.swapSignature,
    recipient: deployer.address,
  });
  const wantBal = await want.balanceOf(deployer.address);
  await want.transfer(other.address, wantBal.div(2));
  await unpauseIfPaused(strategy, keeper);
  return { want };
};

const setupStrategyOnce = async ({ strategy, keeper, config }) => {
  await strategy.setKeeper(keeper.address);
  await strategy.setPendingRewardsFunctionName(config.pendingRewardsFunctionName);
};
