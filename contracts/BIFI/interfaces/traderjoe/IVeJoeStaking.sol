// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVeJoeStaking {
    function claim() external;
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _amount) external;
}
