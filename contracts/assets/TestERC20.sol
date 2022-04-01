// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

error CallerIsNotAMinter();

contract TestERC20 is ERC20{

    address public immutable minter;

    constructor(string memory name, string memory symbol, uint256 amount) ERC20(name, symbol) {
        minter = _msgSender();
        _mint(_msgSender(), amount);
    }


    function mint(address to, uint256 amount) public {
        if(_msgSender() != minter)
            revert CallerIsNotAMinter();
        _mint(to, amount);
    }
}