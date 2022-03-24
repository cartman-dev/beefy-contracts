// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../../interfaces/traderjoe/IVeJoeStaking.sol";
import "../../interfaces/common/gauge/IGaugeStrategy.sol";
import "../../interfaces/common/gauge/IVeWantFeeDistributor.sol";

contract VeJoeStakingManager is Initializable, OwnableUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @dev Beefy Contracts:
     * {feeDistributor} - Address of the fee distributor for veWant rewards.
     * {gaugeProxy} - Address for voting on gauge weightings.
     * {keeper} - Address to manage a few lower risk features of the strat.
     * {rewardPool} - Address for distributing locked want rewards.
     */
    IVeJoeStaking public veJoeStaking;
    address public keeper;
    address public boostedChef;

    mapping(uint256 => address) whitelistedStrategy;
    mapping(address => address) replacementStrategy;

    /**
     * @dev Initializes the base strategy.
     * @param _feeDistributor address of veWant fee distributor.
     * @param _gaugeProxy address of gauge proxy to vote on.
     * @param _keeper address to use as alternative owner.
     * @param _rewardPool address of reward pool.
     */
    function managerInitialize(
        address _veJoeStaking,
        address _keeper,
    ) internal initializer {
        __Ownable_init();

        boostedChef = IBoostedChef(_boostedChef);
        keeper = _keeper;
    }

    // checks that caller is either owner or keeper.
    modifier onlyManager() {
        require(msg.sender == owner() || msg.sender == keeper, "!manager");
        _;
    }

    // checks that caller is the strategy assigned to a specific gauge.
    modifier onlyWhitelist(uint256 _poolId) {
        require(whitelistedStrategy[_poolId] == msg.sender, "!whitelisted");
        _;
    }

    // checks that caller is the reward pool.
    modifier onlyRewardPool() {
        require(msg.sender == rewardPool, "!rewardPool");
        _;
    }

    /**
     * @dev Updates address of the fee distributor.
     * @param _feeDistributor new fee distributor address.
     */
    function setFeeDistributor(address _feeDistributor) external onlyOwner {
        feeDistributor = IVeWantFeeDistributor(_feeDistributor);
    }

    /**
     * @dev Updates address of the strat keeper.
     * @param _keeper new keeper address.
     */
    function setKeeper(address _keeper) external onlyManager {
        keeper = _keeper;
    }

    /**
     * @dev Updates address where reward pool where want is rewarded.
     * @param _rewardPool new reward pool address.
     */
    function setRewardPool(address _rewardPool) external onlyOwner {
        rewardPool = _rewardPool;
    }

     /**
     * @dev Whitelists a strategy address to interact with the Gauge Staker and gives approvals.
     * @param _strategy new strategy address.
     */
    function whitelistStrategy(address _strategy) external onlyManager {
        IERC20Upgradeable _want = IGaugeStrategy(_strategy).want();
        address _gauge = IGaugeStrategy(_strategy).gauge();
        require(IGauge(_gauge).balanceOf(address(this)) == 0, '!inactive');

        _want.safeApprove(_gauge, 0);
        _want.safeApprove(_gauge, type(uint256).max);
        whitelistedStrategy[_gauge] = _strategy;
    }

    /**
     * @dev Removes a strategy address from the whitelist and remove approvals.
     * @param _strategy remove strategy address from whitelist.
     */
    function blacklistStrategy(address _strategy) external onlyManager {
        IERC20Upgradeable _want = IBoostedStrategy(_strategy).want();
        uint256 _poolId = IBoostedStrategy(_strategy).poolId();
        _want.safeApprove(boostedChef, 0);
        whitelistedStrategy[_gauge] = address(0);
    }

    /**
     * @dev Prepare a strategy to be retired and replaced with another.
     * @param _oldStrategy strategy to be replaced.
     * @param _newStrategy strategy to be implemented.
     */
    function proposeStrategy(address _oldStrategy, address _newStrategy) external onlyManager {
        require(IBoostedStrategy(_oldStrategy).poolId() == IBoostedStrategy(_newStrategy).poolId(), '!poolId');
        require(IBoostedStrategy(_oldStrategy).chef() == IBoostedStrategy(_newStrategy).chef(), '!chef');
        replacementStrategy[_oldStrategy] = _newStrategy;
    }

    /**
     * @dev Switch over whitelist from one strategy to another for a LP.
     * @param _lp LP for which the new strategy will be whitelisted.
     */
    function upgradeStrategy(uint256 _lp) external onlyWhitelist(_lp) {
        whitelistedStrategy[_lp] = replacementStrategy[msg.sender];
    }
}