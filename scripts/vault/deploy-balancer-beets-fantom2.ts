import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import vaultV7 from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7.sol/BeefyVaultV7.json";
import vaultV7Factory from "../../artifacts/contracts/BIFI/vaults/BeefyVaultV7Factory.sol/BeefyVaultV7Factory.json";
import stratAbi from "../../artifacts/contracts/BIFI/strategies/Balancer/StrategyBalancerMultiRewardChefUniV2.sol/StrategyBalancerMultiRewardChefUniV2.json";
import stratComAbi from "../../artifacts/contracts/BIFI/strategies/Balancer/StrategyBalancerMultiRewardChefUniV2.sol/StrategyBalancerMultiRewardChefUniV2.json";

const {
  platforms: { beethovenx, beefyfinance },
  tokens: {
    BEETS: { address: BEETS },
    WFTM: { address: WFTM },
    USDC: { address: USDC },
  },
} = addressBook.fantom;

const chef = beethovenx.masterchef;
const want = web3.utils.toChecksumAddress("0x56aD84b777ff732de69E85813DAEE1393a9FFE10");

const strategyName = "contracts/BIFI/flattened.sol:StrategyBalancerMultiRewardChefUniV2";

const vaultParams = {
  mooName: "Moo Beets Fantom of the Opera Act 2",
  mooSymbol: "mooBeetsFantomOfTheOperaAct2",
  delay: 21600,
};

const bytes0 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const strategyParams = {
  poolId: 99,
  unirouter: beethovenx.router,
  strategist: "0xB189ad2658877C4c63E07480CB680AfE8c192412", // fantom only
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  beefyFeeConfig: beefyfinance.beefyFeeConfig,
  beefyVaultProxy: "0x740CE0674aF6eEC113A435fAa53B297536A3e89B", //beefyfinance.vaultProxy,
  composableStrat: false,
  strategyImplementation: "0x64575Ee43D2E71E8476970A726f15a2cBCa46A9A",
  comStrategyImplementation: "0x617B09c47c3918207fA154b7b789a8E5CDC1680A",
  useVaultProxy: true,
  extraReward: false,
  secondExtraReward: false,
  outputToNativeAssets: [BEETS, WFTM],
  outputToNativeRouteBytes: [["0xcde5a11a4acb4ee4c805352cec57e236bdbc3837000200000000000000000019", 0, 1]],
  nativeToInputAssets: [WFTM],
  nativeToInputRouteBytes: [[bytes0, 0, 0]],
  rewardAssets: [WFTM, USDC, WFTM, WFTM, USDC],
  rewardRoute: [
    ["0x88d07558470484c03d3bb44c3ecc36cafcf43253000000000000000000000051", 0, 1],
    ["0x899f737750db562b88c1e412ee1902980d3a4844000200000000000000000081", 1, 2],
    ["0xde45f101250f2ca1c0f8adfc172576d10c12072d00000000000000000000003f", 2, 3],
    ["0xdd89c7cd0613c1557b2daac6ae663282900204f100000000000000000000003e", 3, 4],
  ],
  secondRewardAssets: [WFTM, USDC],
  secondRewardRoute: [["0x39965c9dab5448482cf7e002f583c812ceb53046000100000000000000000003", 0, 1]],
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

  // const AbstractStrategyFactory = await ethers.getContractFactory(strategyName);

  // console.log("Deploying abstract strategy: ", strategyName);

  // const AbstractStrategy = await AbstractStrategyFactory.deploy();
  // await AbstractStrategy.deployed();

  // console.log(strategyName, AbstractStrategy.address);

  console.log("Deploying:", vaultParams.mooName);

  const factory = await ethers.getContractAt(vaultV7Factory.abi, strategyParams.beefyVaultProxy);
  let vault = await factory.callStatic.cloneVault();
  let tx = await factory.cloneVault();
  tx = await tx.wait();
  tx.status === 1
    ? console.log(`Vault ${vault} is deployed with tx: ${tx.transactionHash}`)
    : console.log(`Vault ${vault} deploy failed with tx: ${tx.transactionHash}`);

  let strat = await factory.callStatic.cloneContract(
    strategyParams.composableStrat ? strategyParams.comStrategyImplementation : strategyParams.strategyImplementation
  );
  let stratTx = await factory.cloneContract(
    strategyParams.composableStrat ? strategyParams.comStrategyImplementation : strategyParams.strategyImplementation
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

  const strategyConstructorArguments = [
    want,
    [strategyParams.composableStrat, false],
    strategyParams.nativeToInputRouteBytes,
    strategyParams.outputToNativeRouteBytes,
    [strategyParams.outputToNativeAssets, strategyParams.nativeToInputAssets],
    chef,
    strategyParams.poolId,
    [
      vault,
      strategyParams.unirouter,
      strategyParams.keeper,
      strategyParams.strategist,
      strategyParams.beefyFeeRecipient,
      strategyParams.beefyFeeConfig,
    ],
  ];

  const comStrategyConstructorArguments = [
    [strategyParams.composableStrat, false],
    strategyParams.nativeToInputRouteBytes,
    strategyParams.outputToNativeRouteBytes,
    [strategyParams.outputToNativeAssets, strategyParams.nativeToInputAssets],
    chef,
    strategyParams.poolId,
    [
      vault,
      strategyParams.unirouter,
      strategyParams.keeper,
      strategyParams.strategist,
      strategyParams.beefyFeeRecipient,
      strategyParams.beefyFeeConfig,
    ],
  ];

  let abi = strategyParams.composableStrat ? stratComAbi.abi : stratAbi.abi;
  const stratContract = await ethers.getContractAt(abi, strat);
  let args = strategyParams.composableStrat ? comStrategyConstructorArguments : strategyConstructorArguments;
  let stratInitTx = await stratContract.initialize(...args);
  stratInitTx = await stratInitTx.wait();
  stratInitTx.status === 1
    ? console.log(`Strat Intilization done with tx: ${stratInitTx.transactionHash}`)
    : console.log(`Strat Intilization failed with tx: ${stratInitTx.transactionHash}`);

  if (strategyParams.extraReward) {
    stratInitTx = await stratContract.addRewardToken(
      strategyParams.rewardAssets[0],
      strategyParams.rewardRoute,
      strategyParams.rewardAssets,
      bytes0,
      100
    );
    stratInitTx = await stratInitTx.wait();
    stratInitTx.status === 1
      ? console.log(`Reward Added with tx: ${stratInitTx.transactionHash}`)
      : console.log(`Reward Addition failed with tx: ${stratInitTx.transactionHash}`);
  }

  if (strategyParams.secondExtraReward) {
    stratInitTx = await stratContract.addRewardToken(
      strategyParams.secondRewardAssets[0],
      strategyParams.secondRewardRoute,
      strategyParams.secondRewardAssets,
      bytes0,
      100
    );
    stratInitTx = await stratInitTx.wait();
    stratInitTx.status === 1
      ? console.log(`Reward Added with tx: ${stratInitTx.transactionHash}`)
      : console.log(`Reward Addition failed with tx: ${stratInitTx.transactionHash}`);
  }
  // add this info to PR
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
