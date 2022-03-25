const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");

const { addressBook } = require("blockchain-addressbook");
const { deployStaker } = require("../../utils/deployStaker");
const { deployVault } = require("../../utils/deployVault");
const { delay, nowInSeconds } = require("../../utils/timeHelpers");
const { chainCallFeeMap } = require("../../utils/chainCallFeeMap");

const { zapNativeToToken, getVaultWant, unpauseIfPaused, getUnirouterData } = require("../../utils/testHelpers");

// TOKENS
const JOE = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
const VEJOE = "0x3cabf341943Bc8466245e4d6F1ae0f8D071a1456";
const USDC_AVAX_LP = "0xf4003f4efbe8691b60249e6afbd307abe7758adb";
const USDC = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

// SCs
const VEJOE_STAKING = "0x25D85E17dD9e544F6E9F8D44F99602dbF5a97341";
const BOOSTEDMASTERCHEF = "0x4483f0b6e2F5486D06958C20f8C39A7aBe87bf8F";
const UNIROUTER = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4";

// OTHER ADDRESSES
const KEEPER = "0x340465d9D2EbDE78F15a3870884757584F97aBB4";
const STRATEGIST = "0x6453bD91C3B06DCC24F588FFfa384b0EEB0178B3";
const BEEFYFEERECIPIENT = "0x8Ef7C232470f85Af0809ce5E43888F989eFcAF47";

// CONFIG
const TIMEOUT = 10 * 60 * 1000;
const RPC = "http://127.0.0.1:8545";
const AMOUNT = ethers.BigNumber.from("5000000000000000000000");
const POOLID = 0;

// Error Codes
const OWNABLE_ERROR = "Ownable: caller is not the owner";
const PAUSED_ERROR = "Pausable: paused";

function fmt(n, p = 4) {
  return Number(n / 1e18).toFixed(p);
}

describe("VeJoeArch", async () => {
  let vault, strategy, impl, staker, unirouter, want, deployer, keeper, other;

  before(async () => {
    [deployer, keeper, other] = await ethers.getSigners();
  });

  const setup = async () => {
    const abis = {
      erc20: await artifacts.readArtifact("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20"),
      chef: await artifacts.readArtifact("IBoostedMasterChef"),
      veStaking: await artifacts.readArtifact("IVeWantStaking"),
      veToken: await artifacts.readArtifact("contracts/BIFI/interfaces/common/boost/IVeWant.sol:IVeWant"),
      router: await artifacts.readArtifact("IUniswapRouterETH"),
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
        name: "Beefy Escrowed JOE",
        symbol: "beJOE",
      },
      signer: signer,
    });
    return { impl, staker };
  };

  const StratArch = async ({ signer, stakerAddr }) => {
    const { vault, strategy } = await deployVault({
      vault: "BeefyVaultV6",
      strategy: "StrategyCommonChefBoostedLP",
      want: USDC_AVAX_LP,
      mooName: "Moo Joe USDC-AVAX",
      mooSymbol: "mooJoeUSDC-AVAX",
      delay: 60,
      strategyParams: {
        want: USDC_AVAX_LP,
        poolId: POOLID,
        chef: BOOSTEDMASTERCHEF,
        staker: stakerAddr,
        unirouter: UNIROUTER,
        keeper: KEEPER,
        strategist: STRATEGIST,
        beefyFeeRecipient: BEEFYFEERECIPIENT,
        outputToNativeRoute: [JOE, WAVAX],
        outputToLp0Route: [JOE, WAVAX],
        outputToLp1Route: [JOE, USDC],
      },
      signer: signer,
      rpc: RPC,
    });

    return { vault, strategy };
  };

  describe("VeJoeStaker", async () => {
    let vault, strategy, impl, staker, unirouter, want, deployer, keeper, other;

    before(async () => {
      [deployer, keeper, other] = await ethers.getSigners();
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
  });

  describe("StrategyCommonChefBoostedLP", async () => {
    let vault, strategy, impl, staker, unirouter, want, deployer, keeper, other;

    before(async () => {
      [deployer, keeper, other] = await ethers.getSigners();
      ({ impl, staker } = await StakerArch({ signer: deployer }));
      ({ vault, strategy } = await StratArch({ signer: deployer, stakerAddr: staker.address }));
    });

    beforeEach(async () => {
      const unirouterAddr = await strategy.unirouter();
      const unirouterData = getUnirouterData(unirouterAddr);
      unirouter = await ethers.getContractAt(unirouterData.interface, unirouterAddr);
      want = await getVaultWant(vault, WAVAX);

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
    });

    it("deploys", async () => {
      ({ impl, staker } = await StakerArch({ signer: deployer }));

      ({ vault, strategy } = await StratArch({ signer: deployer, stakerAddr: staker.address }));

      expect(await vault.strategy()).to.equal(strategy.address);
      expect(await strategy.vault()).to.equal(vault.address);
    }).timeout(TIMEOUT);
  });
});
