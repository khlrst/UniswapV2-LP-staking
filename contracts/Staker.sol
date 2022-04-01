// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";

error CallerIsNotAnAdmin();
error InvalidArgument();
error NothingToClaim();

contract Staking is Context{
    using SafeERC20 for IERC20;

    struct Staker {
        uint256 staked;
        uint256 gained;
        uint256 when;
        uint256 distributed;
    }

    struct Config {
        uint128 step;
        uint128 percent;
    }

    ///@dev Emitted when user stake tokens
    ///@param amount amount of staked tokens
    ///@param time current block.timestamp
    ///@param sender msg.sender addresss
    event Staked(uint256 amount, uint256 time, address indexed sender);

    ///@dev Emitted when user claims reward tokens
    ///@param amount amount of claimed tokens
    ///@param time current block.timestamp
    ///@param sender msg.sender addresss
    event Claimed(
        uint256 amount,
        uint256 time,
        address indexed sender
    );

    ///@dev Emitted when user unstakes token
    ///@param amount amount of unstaked tokens
    ///@param time current block.timestamp
    ///@param sender msg.sender address
    event Unstaked(uint256 amount, uint256 time, address indexed sender);

    address public immutable stakingToken;
    address public immutable rewardToken;

    // 128 bit on the left side contain period and 128 bit on the right contain amount of tokens for staked token 
    uint256 public config;

    // This staking contract admin
    address public immutable admin;

    mapping(address => Staker) public stakers;

    modifier onlyAdmin(){
        if(_msgSender() != admin) 
            revert CallerIsNotAnAdmin();
        _;
    }

    constructor(address _stakingToken, address _rewardToken) {
        admin = _msgSender();
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
    }

    function stake(uint amount) external {
        if (amount == 0) 
            revert InvalidArgument();
        Staker storage staker = stakers[_msgSender()];
        if (staker.staked != 0)
            _claim(staker);
        staker.staked += amount;
        staker.when = block.timestamp;
        emit Staked(amount, block.timestamp, _msgSender());
    }

    function unstake(uint amount) external {
        Staker storage staker = stakers[_msgSender()];
         if (amount == 0 || amount > staker.staked) 
            revert InvalidArgument();
        claim();
        staker.staked -= amount;
        delete staker.when;
        emit Unstaked(amount, block.timestamp, _msgSender());
    }

    function claim() public {
        Staker storage staker = stakers[_msgSender()];
        if (staker.staked == 0)
            revert NothingToClaim();
        _claim(staker);
    }

    function _claim(Staker storage staker) private{
        uint reward = calcReward(staker);
        IERC20(rewardToken).safeTransfer(_msgSender(), reward);
        emit Claimed(reward, block.timestamp, _msgSender());
    }

    function calcReward(Staker storage staker) private view returns(uint available){
        uint config_ = config;
        uint step = config_ >> 128;
        uint tps = config_ & uint256(type(uint128).max);
        uint currentReward = (((staker.when - block.timestamp)/step) * (staker.staked * tps))/100;
        available = currentReward > staker.gained ? currentReward - staker.gained : 0;
        return available;
    }

}