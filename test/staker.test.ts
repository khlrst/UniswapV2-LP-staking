import { expect } from 'chai';
import { BigNumber } from 'bignumber.js';
import { ethers, network} from 'hardhat';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {IUniswapV2Router02, IUniswapV2Factory, Staking, TestERC20, IUniswapV2Pair} from '../typechain'

BigNumber.config({ EXPONENTIAL_AT: 60 }); // configure big number

const MIN_LIQUIDITY = 10**3; // UniswapV2Pair minimum liqudity

async function getCurrentTime(){
    return (
      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    ).timestamp;
  }
  
  async function evm_increaseTime(seconds : number){
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

describe("Testing LP-staking with fork", () =>{
    let  router : IUniswapV2Router02;
    let token : TestERC20;
    let staking : Staking;
    let factory : IUniswapV2Factory;
    let lptoken : IUniswapV2Pair;

    let clean : any;
    let owner : SignerWithAddress, staker_one : SignerWithAddress, staker_two: SignerWithAddress;
    
    before(async () => {

        // get signers
        [owner, staker_one, staker_two] = await ethers.getSigners();

        // deploy test erc20 token
        const Token = await ethers.getContractFactory("TestERC20");
        token = <TestERC20>(await Token.deploy(
            "Test Token",
            "TKN",
            ethers.utils.parseUnits("1000000", ethers.BigNumber.from(18) )
        ));
        await token.deployed();

        // get Uniswap Router and Factory
        router = <IUniswapV2Router02>(await ethers.getContractAt("IUniswapV2Router02", process.env.ROUTER_ADDRESS as string));
        factory = <IUniswapV2Factory>(await ethers.getContractAt("IUniswapV2Factory", process.env.FACTORY_ADDRESS as string));
        
        //approve router
        await token.transfer(staker_one.address, ethers.utils.parseUnits("10000", await token.decimals()));
        await token.transfer(staker_two.address, ethers.utils.parseUnits("10000", await token.decimals()));
        await token.connect(staker_one).approve(router.address, ethers.constants.MaxUint256);
        await token.connect(staker_two).approve(router.address, ethers.constants.MaxUint256);

        // create Pool
        let deadline = await getCurrentTime() + 100;
        
        await router.connect(staker_one).addLiquidityETH(
            token.address,
            ethers.utils.parseUnits("10000", await token.decimals()),
            0,
            ethers.utils.parseEther("1"),
            staker_one.address,
            deadline,
            { value: ethers.utils.parseEther("1") }
        );

        deadline = await getCurrentTime() + 100
        await router.connect(staker_two).addLiquidityETH(
            token.address,
            ethers.utils.parseUnits("10000", await token.decimals()),
            0,
            ethers.utils.parseEther("1"),
            staker_two.address,
            deadline,
            { value: ethers.utils.parseEther("1") }
        );

        // get pair
        lptoken = <IUniswapV2Pair>(await ethers.getContractAt(
            "IUniswapV2Pair", 
            await factory.getPair(token.address, process.env.WETH_ADDRESS as string))
        );

        // deploy staking
        const Staking = await ethers.getContractFactory("Staking");
        staking = <Staking>(await Staking.deploy(
            lptoken.address,
            token.address,
            60,
            100 // 1% every 1 min
        ));
        await staking.deployed();

        // fund staking with remaining tokens
        await token.transfer(staking.address,  ethers.utils.parseUnits("980000", await token.decimals()));

        // approve staking
        await lptoken.connect(staker_one).approve(staking.address, ethers.utils.parseUnits("1000", await lptoken.decimals()));
        await lptoken.connect(staker_two).approve(staking.address, ethers.utils.parseUnits("1000", await lptoken.decimals()));
        
        // take a world-state snapshot
        clean = await network.provider.request({
            method: "evm_snapshot",
            params: []
        });
    });
    describe("Pool setup and Staker deployment", () => {
        it("UniSwap: Liquidity minted", async () => {
            expect(await lptoken.balanceOf(staker_one.address)).to.be.eq(
                ethers.utils.parseUnits(Math.sqrt(10_000*1).toString(), await lptoken.decimals()).sub(MIN_LIQUIDITY) // uniswap liquidity calcucalted, k = sqrt(a*b)
            );
            expect(await lptoken.balanceOf(staker_one.address)).to.be.eq(
                ethers.utils.parseUnits(Math.sqrt(10_000*1).toString(), await lptoken.decimals()).sub(MIN_LIQUIDITY)
            );
            expect(await lptoken.totalSupply()).to.be.eq(
                ethers.utils.parseUnits(Math.sqrt(10_000*1).toString(), await lptoken.decimals()).mul(2)
            );
        })
    
        it("Staking: storage initialized correctly", async () => {
            let config = await staking.getConfig();
            expect(config.step).to.be.eq(ethers.BigNumber.from(60));
            expect(config.tps).to.be.eq(ethers.BigNumber.from(100));
            expect(await staking.admin()).to.be.eq(owner.address);
            expect(await staking.stakingToken()).to.be.eq(lptoken.address);
            expect(await staking.rewardToken()).to.be.eq(token.address);
        });
    
        it("Staking: OnlyAdmin setters revert", async () => {
            await expect(staking.connect(staker_one).setConfig(60, 100)).to.be.revertedWith("CallerIsNotAnAdmin");
        });
    
        it("Staking: OnlyAdmin setters pass", async () => {
            await expect(staking.setConfig(60, 100)).to.emit(staking, "ConfigChanged").withArgs(60, 100, 60, 100);
            let config = await staking.getConfig();
            expect(config.step).to.be.eq(ethers.BigNumber.from(60));
            expect(config.tps).to.be.eq(ethers.BigNumber.from(100));
        }); 

        it("Staking: funded correctly", async () => {
            expect(await token.balanceOf(staking.address)).to.be.eq(ethers.utils.parseUnits("980000", await token.decimals()));
            expect(await token.balanceOf(owner.address)).to.be.eq(0);
            expect(await token.balanceOf(staker_one.address)).to.be.eq(0);
            expect(await token.balanceOf(staker_two.address)).to.be.eq(0);
        });
    });
    describe("Staking, unstaking and claming works correctly", () => {
        describe("Single staker tests pass", () => {
            after(async () => {
                // clean state after test case
                await network.provider.request({
                    method: "evm_revert",
                    params: [clean],
                });
                // take a world-state snapshot
                clean = await network.provider.request({
                    method: "evm_snapshot",
                    params: []
                });
            });

            it("stake", async ()=> {
                await evm_increaseTime(10*60);
                let amount = ethers.utils.parseUnits("10", await lptoken.decimals())
                await expect(staking.connect(staker_one).stake(amount)).to.emit(staking, "Staked").withArgs(amount, staker_one.address);
                expect((await staking.stakers(staker_one.address))[0]).to.be.eq(amount);
                expect(await lptoken.balanceOf(staking.address)).to.be.eq(ethers.utils.parseUnits("10", await lptoken.decimals()));
            });

            it("claim", async ()=> {
                // wait 10 mins
                await evm_increaseTime(10*60);
                let amount = ethers.utils.parseUnits("1", await token.decimals())
                expect(await token.balanceOf(staker_one.address)).to.be.eq(0);
                await expect(staking.connect(staker_one).claim()).to.emit(staking, "Claimed").withArgs(amount, staker_one.address);
                expect(await token.balanceOf(staker_one.address)).to.be.eq(amount);
            });

            it("unstake", async ()=> {
                await evm_increaseTime(10*60);
                let amount = ethers.utils.parseUnits("10", await lptoken.decimals())
                await expect(staking.connect(staker_one).unstake()).to.emit(staking, "Unstaked").withArgs(amount, staker_one.address);
                expect(await lptoken.balanceOf(staking.address)).to.be.eq(0);
                expect((await staking.stakers(staker_one.address))[0]).to.be.eq(0);
                expect(await token.balanceOf(staker_one.address)).to.be.eq(ethers.utils.parseUnits("2", await token.decimals()));
            });

            it("unstake reverts", async ()=> {
                await expect(staking.connect(staker_one).unstake()).to.be.revertedWith("NothingToUnstake");
            });

            it("claim reverts", async ()=> {
                await expect(staking.connect(staker_one).claim()).to.be.revertedWith("NothingToClaim");
            });
        });
    })
});