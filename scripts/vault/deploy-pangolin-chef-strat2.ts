import hardhat, { ethers, web3 } from "hardhat";
import { avax } from "../../../beefy-api/packages/address-book/build/address-book/avax";
import vaultV7 from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7.sol/BeefyVaultV7.json";
import vaultV7Factory from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7Factory.sol/BeefyVaultV7Factory.json";
import stratAbi from "../../artifacts/contracts/BIFI/strategies/Common/StrategyCommonMinichefLP.sol/StrategyCommonMinichefLP.json";

const {
  platforms: { pangolin, beefyfinance },
  tokens: {
    AVAX: { address: AVAX },
    PNG: { address: PNG },
    USDC: { address: USDC },
    USDT: { address: USDT },
    USDTe: { address: USDTe },
    WBTCe: { address: WBTCe },
    WETHe: { address: WETHe },
  },
} = avax;

const want = web3.utils.toChecksumAddress("0xe3bA3d5e3F98eefF5e9EDdD5Bd20E476202770da");
const strategist = web3.utils.toChecksumAddress("0x135ED183a23b1C45F8134f5E0053077940EE0D3D"); // AVAX only

const vaultParams = {
  mooName: "Moo Pangolin BTCb-USDC",
  mooSymbol: "mooPangolinBTCb-USDC",
  delay: 21600,
};

const strategyParams = {
  want: want,
  poolId: 115,
  chef: pangolin.minichef,
  unirouter: pangolin.router,
  strategist: strategist,
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  beefyFeeConfig: beefyfinance.beefyFeeConfig,
  outputToNativeRoute: [PNG, AVAX],
  nativeToLp0Route: [AVAX, USDT],
  nativeToLp1Route: [AVAX],
  setAdditionalRewards: false,
  additionalRewards: [[USDT, [USDT, AVAX], 0]],
  vaultFactory: beefyfinance.vaultFactory || "",
  strategyImplementation: "0x3590cEEbd6f384E05B768abe9070Adb8571EA3b7",
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

  const factory = await ethers.getContractAt(vaultV7Factory.abi, strategyParams.vaultFactory);
  let vault = await factory.callStatic.cloneVault();
  let vaultTx = await factory.cloneVault();
  vaultTx = await vaultTx.wait();
  vaultTx.status === 1
    ? console.log(`Vault ${vault} deployed with tx: ${vaultTx.transactionHash}`)
    : console.error(`Vault ${vault} deployment failed with tx: ${vaultTx.transactionHash}`);

  let strat = await factory.callStatic.cloneContract(strategyParams.strategyImplementation);
  let stratTx = await factory.cloneContract(strategyParams.strategyImplementation);
  stratTx = await stratTx.wait();
  stratTx.status === 1
    ? console.log(`Strat ${vault} deployed with tx: ${stratTx.transactionHash}`)
    : console.error(`Strat ${vault} deployment failed with tx: ${stratTx.transactionHash}`);

  const vaultConstructorArguments = [strat, vaultParams.mooName, vaultParams.mooSymbol, vaultParams.delay];

  const vaultContract = await ethers.getContractAt(vaultV7.abi, vault);
  let vaultInitTx = await vaultContract.initialize(...vaultConstructorArguments);
  vaultInitTx = await vaultInitTx.wait();
  vaultInitTx.status === 1
    ? console.log(`Vault initialization done with tx: ${vaultInitTx.transactionHash}`)
    : console.error(`Vault initialization failed with tx: ${vaultInitTx.transactionHash}`);

  vaultInitTx = await vaultContract.transferOwnership(beefyfinance.vaultOwner);
  vaultInitTx = await vaultInitTx.wait();
  vaultInitTx.status === 1
    ? console.log(`Vault ownership transfered with tx: ${vaultInitTx.transactionHash}`)
    : console.error(`Vault ownership transfer failed with tx: ${vaultInitTx.transactionHash}`);

  const strategyConstructorArguments = [
    strategyParams.want,
    strategyParams.poolId,
    strategyParams.chef,
    [
      vault,
      strategyParams.unirouter,
      strategyParams.keeper,
      strategyParams.strategist,
      strategyParams.beefyFeeRecipient,
      strategyParams.beefyFeeConfig,
    ],
    strategyParams.outputToNativeRoute,
    strategyParams.nativeToLp0Route,
    strategyParams.nativeToLp1Route,
  ];

  const stratContract = await ethers.getContractAt(stratAbi.abi, strat);
  let stratInitTx = await stratContract.initialize(...strategyConstructorArguments);
  stratInitTx = await stratInitTx.wait();
  stratInitTx.status === 1
    ? console.log(`Strat initialization done with tx: ${stratInitTx.transactionHash}`)
    : console.error(`Strat initialization failed with tx: ${stratInitTx.transactionHash}`);

  // add this info to PR
  console.log(`${vaultParams.mooName}`);
  console.log(`Vault:    ${vault}`);
  console.log(`Strategy: ${strat}`);
  console.log(`Want:     ${strategyParams.want}`);
  console.log(`PoolId:   ${strategyParams.poolId}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
