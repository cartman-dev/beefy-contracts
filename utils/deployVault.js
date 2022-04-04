const { predictAddresses } = require("./predictAddresses");

const deployVault = async config => {
  const predictedAddresses = await predictAddresses({ creator: config.signer.address, rpc: config.rpc });

  const vaultConstructorArguments = [
    predictedAddresses.strategy,
    config.mooName,
    config.mooSymbol,
    config.delay
  ];

  const Vault = await ethers.getContractFactory(config.vault);
  const vault = await Vault.deploy(...vaultConstructorArguments);
  await vault.deployed();

  const strategyConstructorArguments = [
    config.strategyParams.want,
    config.strategyParams.poolId,
    config.strategyParams.chef,
    config.strategyParams.staker,
    vault.address,
    config.strategyParams.unirouter,
    config.strategyParams.keeper,
    config.strategyParams.strategist,
    config.strategyParams.beefyFeeRecipient,
    config.strategyParams.secondOutputToNativeRoute,
    config.strategyParams.nativeToLp0Route,
    config.strategyParams.nativeToLp1Route,
  ];

  const Strategy = await ethers.getContractFactory(config.strategy);
  const strategy = await Strategy.deploy(...strategyConstructorArguments);
  await strategy.deployed();

  return { vault, strategy };
};

module.exports = { deployVault };
