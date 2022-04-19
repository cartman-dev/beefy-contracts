// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

import {DSTest} from "./forge/test.sol";
import {Utilities} from "./utils/Utilities.sol";
import {console} from "./utils/Console.sol";
import {Vm} from "./forge/Vm.sol";

// Tokens
import {ERC20} from "@openzeppelin-4/contracts/token/ERC20/ERC20.sol";

// Contracts
import {Distributor} from "../contracts/Distributor.sol";

contract TestWant is ERC20 {
    constructor(uint initialSupply) ERC20("Test", "TST") {
        _mint(msg.sender, initialSupply);
    }
}

contract DistributorTest is DSTest{
    Vm internal immutable vm = Vm(HEVM_ADDRESS);
    Utilities internal utils;
    address payable[] internal users;

    Distributor internal d;
    ERC20 internal want;
 
    uint wantStartingAmount = 50 ether;


    function setUp() public {
        utils = new Utilities();
        users = utils.createUsers(5);

        // Distribute 5 want to each user
        vm.startPrank(users[4]);
        want = new TestWant(wantStartingAmount * 1000);
        d = new Distributor(address(want), users[0], users[1]);
        vm.stopPrank();
    }

    function test_distribute() external {
        address payable deployer = users[4];
        address payable alice = users[0];
        address payable bob = users[1];

        uint startDistributorBalance = want.balanceOf(address(d));
        uint startABalance = want.balanceOf(alice);
        uint startBBalance = want.balanceOf(bob);

        // console.log("Depositing to distributor");
        vm.prank(deployer);
        want.transfer(address(d), 10 ether);
        uint depositedDistributorBalance = want.balanceOf(address(d));

        d.distribute();
        
        uint endDistributorBalance = want.balanceOf(address(d));
        uint endABalance = want.balanceOf(alice);
        uint endBBalance = want.balanceOf(bob);

        uint gainDistributor = endDistributorBalance - startDistributorBalance;
        uint gainA = endABalance - startABalance;
        uint gainB = endBBalance - startBBalance;

        // console.log("Distributed", depositedDistributorBalance);
        // console.log("A gained", gainA);
        // console.log("B gained", gainB);

        assertTrue(depositedDistributorBalance > startDistributorBalance, "Expected distributor balance to increase on deposit");
        assertTrue(gainDistributor == 0 && endDistributorBalance == 0, "Expected distributor to end up empty");
        assertTrue(gainA + gainB == depositedDistributorBalance, "Expected all funds to be distributed");
        assertTrue(gainA == gainB, "Expected gains for alice to == bob");
    }

    function test_updateReceiver() external {
        address payable deployer = users[4];
        address payable alice = users[0];
        address payable bob = users[1];
        address payable charles = users[2];
        address payable dave = users[3];

        // Verify initial setup
        address A = d.receiverA();
        address B = d.receiverB();
        assertEq(A, alice);
        assertEq(B, bob);

        // Deployer has no special powers
        vm.prank(deployer);
        vm.expectRevert(bytes("!receiver"));
        d.updateReceiver(charles);

        // Non-receiver fails to update receivers
        vm.prank(charles);
        vm.expectRevert(bytes("!receiver"));
        d.updateReceiver(charles);

        // Alice updates her receiver to Charles without affecting Bob
        vm.prank(alice);
        d.updateReceiver(charles);
        A = d.receiverA();
        B = d.receiverB();
        assertEq(A, charles);
        assertEq(B, bob);

        // Alice no longer can update anything
        vm.prank(alice);
        vm.expectRevert(bytes("!receiver"));
        d.updateReceiver(dave);

        // Bob updates his receiver to Dave without affecting Charles
        vm.prank(bob);
        d.updateReceiver(dave);
        A = d.receiverA();
        B = d.receiverB();
        assertEq(A, charles);
        assertEq(B, dave);

        // Charles updates his receiver back to Alice
        vm.prank(charles);
        d.updateReceiver(alice);
        A = d.receiverA();
        B = d.receiverB();
        assertEq(A, alice);
        assertEq(B, dave);

        // Dave updates his receiver back to Bob
        vm.prank(dave);
        d.updateReceiver(bob);
        A = d.receiverA();
        B = d.receiverB();
        assertEq(A, alice);
        assertEq(B, bob);
    }

    function test_rescue() external {
        address payable deployer = users[4];
        address payable alice = users[0];
        address payable bob = users[1];

        // Distributor is not empty of want
        vm.prank(deployer);
        want.transfer(address(d), 5 ether);
        uint initWantBal = want.balanceOf(address(d));

        // Someone accidentally sent in an unknown token
        ERC20 X = new TestWant(100000 ether);
        X.transfer(address(d), 10 ether);
        uint startBal = X.balanceOf(address(d));

        // Someone rescues the X
        d.rescue(address(X));

        // Here's how things end up
        uint aBal = X.balanceOf(alice);
        uint bBal = X.balanceOf(bob);
        uint endWantBal = want.balanceOf(address(d));

        assertEq(aBal + bBal, startBal); // All X is distributed
        assertEq(endWantBal, initWantBal); // Want is unaffected
    }
}