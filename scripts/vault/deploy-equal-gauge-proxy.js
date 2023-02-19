import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import vaultV7 from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7.sol/BeefyVaultV7.json";
import vaultV7Factory from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7Factory.sol/BeefyVaultV7Factory.json";
import stratAbi from "../../artifacts/contracts/BIFI/strategies/Common/StrategyCommonSolidlyRewardPool.sol/StrategyCommonSolidlyRewardPoolLP.json";
import stratStakerAbi from "../../artifacts/contracts/BIFI/strategies/Balancer/StrategyAuraBalancerComposableMultiRewardGaugeUniV3.sol/StrategyAuraBalancerComposableMultiRewardGaugeUniV3.json";

const {
  platforms: { equalizer, beefyfinance },
  tokens: {
    EQUAL: { address: EQUAL },
    FTM: { address: FTM },
    USDC: { address: USDC },
    BTC: { address: BTC },
  },
} = addressBook.fantom;

const want = web3.utils.toChecksumAddress("0xDA3E21477F872F30794551D908DE244b8839F723");
const gauge = web3.utils.toChecksumAddress("0xcDd56e66d7bd326b55cC23bA49f53262D7382555");
const binSpiritGauge = web3.utils.toChecksumAddress("0x44e314190D9E4cE6d4C0903459204F8E21ff940A");
//const ensId = ethers.utils.formatBytes32String("cake.eth");

const vaultParams = {
  mooName: "Moo Equalizer BTC-FTM",
  mooSymbol: "mooEqualizerBTC-FTM",
  delay: 21600,
};

const strategyParams = {
  want: want,
  gauge: gauge,
  unirouter: equalizer.router,
  gaugeStaker: binSpiritGauge,
  strategist: "0x22e3709Cf6476d67F468F29E4dE2051ED53747A4", // only BSC
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  feeConfig: beefyfinance.beefyFeeConfig,
  outputToNativeRoute: [["0x3Fd3A0c85B70754eFc07aC9Ac0cbBDCe664865A6", FTM, false]],
  outputToLp0Route: [
    ["0x3Fd3A0c85B70754eFc07aC9Ac0cbBDCe664865A6", FTM, false],
    [FTM, BTC, false],
  ],
  outputToLp1Route: [["0x3Fd3A0c85B70754eFc07aC9Ac0cbBDCe664865A6", FTM, false]],
  verifyStrat: false,
  spiritswapStrat: false,
  gaugeStakerStrat: false,
  beefyVaultProxy: "0x740CE0674aF6eEC113A435fAa53B297536A3e89B", //beefyfinance.vaultProxy,
  strategyImplementation: "0x813A0577c905917F2aBD86D8F3a5Fc0057159166",
  strategyImplementationStaker: "0xC3d5c128a3e5b F60C6Fb87A4B644B6a2D8093f55",
  useVaultProxy: true,
  // ensId
};

async function main() {
  if (
    Object.values(vaultParams).some(v => v === undefined) ||
    Object.values(strategyParams).some(v => v === undefined)
  ) {
    console.error("one of config values undefined");
    return;
  }

  await hardhat.run("compile");

  console.log("Deploying:", vaultParams.mooName);

  const factory = await ethers.getContractAt(vaultV7Factory.abi, strategyParams.beefyVaultProxy);
  let vault = await factory.callStatic.cloneVault();
  let tx = await factory.cloneVault();
  tx = await tx.wait();
  tx.status === 1
    ? console.log(`Vault ${vault} is deployed with tx: ${tx.transactionHash}`)
    : console.log(`Vault ${vault} deploy failed with tx: ${tx.transactionHash}`);

  let strat = await factory.callStatic.cloneContract(strategyParams.strategyImplementation);
  let stratTx = await factory.cloneContract(
    strategyParams.gaugeStakerStrat
      ? strategyParams.strategyImplementationStaker
      : strategyParams.strategyImplementation
  );
  stratTx = await stratTx.wait();
  stratTx.status === 1
    ? console.log(`Strat ${strat} is deployed with tx: ${stratTx.transactionHash}`)
    : console.log(`Strat ${strat} deploy failed with tx: ${stratTx.transactionHash}`);

  const vaultConstructorArguments = [strat, vaultParams.mooName, vaultParams.mooSymbol, vaultParams.delay];

  const vaultContract = await ethers.getContractAt(vaultV7.abi, vault);
  let vaultInitTx = await vaultContract.initialize(...vaultConstructorArguments);
  vaultInitTx = await vaultInitTx.wait();
  vaultInitTx.status === 1
    ? console.log(`Vault Intilization done with tx: ${vaultInitTx.transactionHash}`)
    : console.log(`Vault Intilization failed with tx: ${vaultInitTx.transactionHash}`);

  vaultInitTx = await vaultContract.transferOwnership(beefyfinance.vaultOwner);
  vaultInitTx = await vaultInitTx.wait();
  vaultInitTx.status === 1
    ? console.log(`Vault OwnershipTransfered done with tx: ${vaultInitTx.transactionHash}`)
    : console.log(`Vault Intilization failed with tx: ${vaultInitTx.transactionHash}`);

  const strategyConstructorArgumentsStaker = [
    strategyParams.want,
    strategyParams.gauge,
    strategyParams.gaugeStaker,
    [
      vault,
      strategyParams.unirouter,
      strategyParams.keeper,
      strategyParams.strategist,
      strategyParams.beefyFeeRecipient,
      strategyParams.feeConfig,
    ],
    strategyParams.outputToNativeRoute,
    strategyParams.outputToLp0Route,
    strategyParams.outputToLp1Route,
  ];

  const strategyConstructorArguments = [
    strategyParams.want,
    strategyParams.gauge,
    [
      vault,
      strategyParams.unirouter,
      strategyParams.keeper,
      strategyParams.strategist,
      strategyParams.beefyFeeRecipient,
      strategyParams.feeConfig,
    ],
    strategyParams.outputToNativeRoute,
    strategyParams.outputToLp0Route,
    strategyParams.outputToLp1Route,
  ];

  let abi = strategyParams.gaugeStakerStrat ? stratStakerAbi.abi : stratAbi.abi;
  const stratContract = await ethers.getContractAt(abi, strat);
  let args = strategyParams.gaugeStakerStrat ? strategyConstructorArgumentsStaker : strategyConstructorArguments;
  let stratInitTx = await stratContract.initialize(...args);
  stratInitTx = await stratInitTx.wait();
  stratInitTx.status === 1
    ? console.log(`Strat Intilization done with tx: ${stratInitTx.transactionHash}`)
    : console.log(`Strat Intilization failed with tx: ${stratInitTx.transactionHash}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
