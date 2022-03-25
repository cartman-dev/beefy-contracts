// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVeWant {
    function balanceOf(address _user) external view returns (uint256);
    function boostedMasterChef() external view returns (address);
}
