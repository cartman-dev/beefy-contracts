import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "../../../beefy-api/packages/address-book/address-book";
import vaultV7 from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7.sol/BeefyVaultV7.json";
import vaultV7Factory from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7Factory.sol/BeefyVaultV7Factory.json";
import stratAbi from "../../artifacts/contracts/BIFI/strategies/Common/StrategyCommonSolidlyRewardPool.sol/StrategyCommonSolidlyRewardPoolLP.json";
import stratStakerAbi from "../../artifacts/contracts/BIFI/strategies/Common/StrategyCommonSolidlyStakerLP.sol/StrategyCommonSolidlyStakerLP.json";

const {
  platforms: { solidlizard, beefyfinance },
  tokens: {
    SLIZ: { address: SLIZ },
    USDC: { address: USDC },
    USDT: { address: USDT },
    MAI: { address: MAI },
    LUSD: { address: LUSD },
    ETH: { address: ETH },
  },
} = addressBook.arbitrum;

const want = web3.utils.toChecksumAddress("0xB1E9b823295B3C69ac651C05D987B67189ff20AD");
const gauge = web3.utils.toChecksumAddress("0xa4f536393E277DC63ECfa869d901b4f81cc5462C");
const binSpiritGauge = web3.utils.toChecksumAddress("0x408BAF59E27a83740FF426d0BC8c1319f30720c7");
// const ensId = ethers.utils.formatBytes32String("cake.eth");

const vaultParams = {
  mooName: "Moo Solidlizard LUSD-USDC",
  mooSymbol: "mooSolidlizardLUSD-USDC",
  delay: 21600,
};

const strategyParams = {
  want: want,
  gauge: gauge,
  unirouter: solidlizard.router,
  gaugeStaker: binSpiritGauge,
  strategist: "0x2434826b2cA0BeEDc9287Fb592d94328F525eA0D", // only Arbitrum
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  feeConfig: beefyfinance.beefyFeeConfig,
  outputToNativeRoute: [[SLIZ, ETH, false]],
  outputToLp0Route: [
    [SLIZ, USDC, false],
    [USDC, LUSD, true],
  ],
  outputToLp1Route: [[SLIZ, USDC, false]],
  verifyStrat: false,
  spiritswapStrat: false,
  gaugeStakerStrat: true,
  beefyVaultFactory: beefyfinance.vaultFactory,
  strategyImplementation: "0x25f8429A9221cAE76c646d084D2eAD1Aa354EcF4",
  strategyImplementationStaker: "0x25f8429A9221cAE76c646d084D2eAD1Aa354EcF4",
  useVaultFactory: true,
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

  const factory = await ethers.getContractAt(vaultV7Factory.abi, strategyParams.beefyVaultFactory);
  const vault = await factory.callStatic.cloneVault();
  let tx = await factory.cloneVault();
  tx = await tx.wait();
  tx.status === 1
    ? console.log(`Vault ${vault} is deployed with tx: ${tx.transactionHash}`)
    : console.log(`Vault ${vault} deploy failed with tx: ${tx.transactionHash}`);

  const strat = await factory.callStatic.cloneContract(strategyParams.strategyImplementation);
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

  const abi = strategyParams.gaugeStakerStrat ? stratStakerAbi.abi : stratAbi.abi;
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
