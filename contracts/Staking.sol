// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";

error CallerIsNotAnAdmin();
error InvalidArgument();
error NothingToClaim();
error NothingToUnstake();

contract Staking is Context{
    using SafeERC20 for IERC20;

    struct Staker {
        uint256 staked;
        uint256 when;
        uint256 gained;
        uint256 distributed;
    }

    struct Config {
        uint128 step;
        uint128 percent;
    }

    ///@dev Emitted when user stake tokens
    ///@param amount amount of staked tokens
    ///@param sender msg.sender addresss
    event Staked(uint256 amount, address indexed sender);

    ///@dev Emitted when user claims reward tokens
    ///@param amount amount of claimed tokens
    ///@param sender msg.sender addresss
    event Claimed(
        uint256 amount,
        address indexed sender
    );

    ///@dev Emitted when user unstakes token
    ///@param amount amount of unstaked tokens
    ///@param sender msg.sender address
    event Unstaked(uint256 amount, address indexed sender);

    ///@dev Emitted when staking config changes
    ///@param oldStep old reward step
    ///@param oldTps old reward percentage
    ///@param newStep new reward step
    ///@param newTps  new reward percentage
    event ConfigChanged(uint256 oldStep, uint256 oldTps, uint256 newStep, uint256 newTps);

    address public immutable stakingToken;
    address public immutable rewardToken;

    // 128 bit on the left side contain period and 128 bit on the right contain amount of tokens for staked token 100 = 1%
    uint256 private  config;

    // This staking contract admin
    address public immutable admin;

    mapping(address => Staker) public stakers;

    modifier onlyAdmin(){
        if(msg.sender != admin) 
            revert CallerIsNotAnAdmin();
        _;
    }

    constructor(address _stakingToken, address _rewardToken, uint step, uint tps) {
        admin = msg.sender;
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        config = (step << 128) + tps;
    }

    function setConfig(uint newStep, uint newTps) external onlyAdmin {
        (uint oldStep, uint oldTps) = getConfig();
        config = (newStep << 128) + newTps;
        emit ConfigChanged(oldStep, oldTps, newStep, newTps);
    }

    function stake(uint amount) external {
        if (amount == 0) 
            revert InvalidArgument();
        Staker storage staker = stakers[msg.sender];
        if (staker.staked != 0)
            _claim(staker);
        staker.staked += amount;
        staker.when = block.timestamp;
        IERC20(stakingToken).safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(amount, msg.sender);
    }

    function unstake() external {
        Staker storage staker = stakers[msg.sender];
        uint amount = staker.staked;
         if (amount == 0) 
            revert NothingToUnstake();
        _claim(staker);
        delete staker.staked;
        delete staker.when;
        delete staker.gained;
        IERC20(stakingToken).safeTransfer(msg.sender, amount);
        emit Unstaked(amount, msg.sender);
    }

    function claim() public {
        Staker storage staker = stakers[msg.sender];
        if (staker.staked == 0)
            revert NothingToClaim();
        _claim(staker);
    }

    function _claim(Staker storage staker) private{
        uint reward = calcReward(staker);
        if (reward == 0)
            revert NothingToClaim();
        staker.distributed += reward;
        staker.gained += reward;
        IERC20(rewardToken).safeTransfer(msg.sender, reward);
        emit Claimed(reward, msg.sender);
    }

    function calcReward(Staker storage staker) private view returns(uint available){
        (uint step, uint tps) = getConfig();
        uint currentReward = (((block.timestamp - staker.when)/step) * (staker.staked * tps))/10000;
        available = currentReward > staker.gained ? currentReward - staker.gained : 0;
    }

    function getConfig() public view returns(uint step, uint tps){
        uint config_ = config;
        step = config_ >> 128;
        tps = config_ & uint256(type(uint128).max);
    }

}