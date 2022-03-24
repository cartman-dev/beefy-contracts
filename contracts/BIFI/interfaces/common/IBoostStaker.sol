// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

interface IBoostStaker {
    function depositAll() external;
    function deposit(uint256 _amount) external;
    function balanceOfWant() external view returns (uint256);
    function balanceOfVe() external view returns (uint256);
    function stakerFee() external view returns (uint256);
    function deposit(uint256 _pid, uint256 _amount) external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function withdrawAll(uint256 _pid) external;
    function emergencyWithdraw(uint256 _pid) external;
    function claimVeWantReward() external;
    function upgradeStrategy(uint256 _pid) external;
}
