import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import { predictAddresses } from "../../utils/predictAddresses";

const registerSubsidy = require("../../utils/registerSubsidy");

const {
  platforms: { thena, beefyfinance },
  tokens: {
    THE: { address: THE },
    USDC: { address: USDC },
    BUSD: { address: BUSD },
    BNB: { address: BNB },
    ETH: { address: ETH },
    MAI: { address: MAI },
    USDT: { address: USDT },
    BTCB: { address: BTCB },
    BNBx: { address: BNBx },
    FRAX: { address: FRAX },
    MATIC: { address: MATIC },
    BRZ: { address: BRZ },
  },
} = addressBook.bsc;

const want = web3.utils.toChecksumAddress("0xA0695f78AF837F570bcc50f53e58Cda300798B65");
const gauge = web3.utils.toChecksumAddress("0x16986d091A0d168F8d64D3180811D56ff52Bfb66");

const jBRL = web3.utils.toChecksumAddress("0x316622977073BBC3dF32E7d2A9B3c77596a0a603");

const vaultParams = {
  mooName: "Moo Thena jBRL-BRZ",
  mooSymbol: "mooThenajBRL-BRZ",
  delay: 21600,
};

const strategyParams = {
  want: want,
  gauge: gauge,
  unirouter: thena.router,
  strategist: "0x22e3709Cf6476d67F468F29E4dE2051ED53747A4", // only BSC
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  feeConfig: beefyfinance.beefyFeeConfig,
  outputToNativeRoute: [[THE, BNB, false]],
  outputToBUSDRoute: [[THE, BUSD, false]],
  lp1ToLp0Route: [[BRZ, jBRL, true]],
  busdToLp1Route: [BUSD, BRZ],
  verifyStrat: true,
};

const contractNames = {
  vault: "BeefyVaultV6",
  strategy: "StrategyJBRLSolidlyGaugeLP",
};

async function main() {
  if (
    Object.values(vaultParams).some(v => v === undefined) ||
    Object.values(strategyParams).some(v => v === undefined) ||
    Object.values(contractNames).some(v => v === undefined)
  ) {
    console.error("one of config values undefined");
    return;
  }

  await hardhat.run("compile");

  const Vault = await ethers.getContractFactory(contractNames.vault);
  const Strategy = await ethers.getContractFactory(contractNames.strategy);

  const [deployer] = await ethers.getSigners();

  console.log(vaultParams.mooName);

  const predictedAddresses = await predictAddresses({ creator: deployer.address });

  const vaultConstructorArguments = [
    predictedAddresses.strategy,
    vaultParams.mooName,
    vaultParams.mooSymbol,
    vaultParams.delay,
  ];
  const vault = await Vault.deploy(...vaultConstructorArguments);
  await vault.deployed();

  const strategyConstructorArguments = [
    strategyParams.want,
    strategyParams.gauge,
    [
      vault.address,
      strategyParams.unirouter,
      strategyParams.keeper,
      strategyParams.strategist,
      strategyParams.beefyFeeRecipient,
      strategyParams.feeConfig,
    ],
    strategyParams.outputToNativeRoute,
    strategyParams.outputToBUSDRoute,
    strategyParams.lp1ToLp0Route,
    strategyParams.busdToLp1Route,
  ];

  const strategy = await Strategy.deploy(...strategyConstructorArguments);
  await strategy.deployed();

  // add this info to PR
  console.log("Vault:    ", vault.address);
  console.log("Strategy: ", strategy.address);
  console.log("Want:     ", strategyParams.want);
  console.log("gauge:    ", strategyParams.gauge);

  console.log();
  console.log("Running post deployment");

  // await setPendingRewardsFunctionName(strategy, strategyParams.pendingRewardsFunctionName);
  await vault.transferOwnership(beefyfinance.vaultOwner);
  console.log(`Transfered Vault Ownership to ${beefyfinance.vaultOwner}`);

  if (hardhat.network.name === "bsc") {
    await registerSubsidy(vault.address, deployer);
    await registerSubsidy(strategy.address, deployer);
  }

  if (strategyParams.verifyStrat) {
    console.log("verifying contract...");

    await hardhat.run("verify:verify", {
      address: strategy.address,
      constructorArguments: [...strategyConstructorArguments],
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
