import { BigNumber, formatFixed, parseFixed } from '@ethersproject/bignumber';
import { OldBigNumber, SubgraphPoolBase, SwapTypes } from '../../src';
import {
    filterPoolsOfInterest,
    parseToPoolsDict,
    producePaths,
} from '../../src/routeProposal/filtering';
import { calculatePathLimits } from '../../src/routeProposal/pathLimits';
import {
    OraiswapFactoryQueryClient,
    OraiswapPairQueryClient,
    PairInfo,
} from '@oraichain/oraidex-contracts-sdk';
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import {
    FACTORY_CONTRACT,
    FACTORY_V2_CONTRACT,
    ORAI,
    PAIRS,
    USDC_CONTRACT,
    parseAssetInfo,
    toAmount,
    truncDecimals,
} from '@oraichain/oraidex-common';
import { PoolResponse } from '@oraichain/oraidex-contracts-sdk/build/OraiswapPair.types';
import fs from 'fs';
import path from 'path';
import { getBestPaths } from '../../src/router';
import { formatSwaps } from '../../src/formatSwaps';

type DetailedPair = PairInfo & PoolResponse;

const mapOraichainPoolsToBalancerPools = (
    detailedPair: DetailedPair
): SubgraphPoolBase => {
    return {
        id: detailedPair.liquidity_token,
        address: detailedPair.contract_addr,
        poolType: 'Weighted',
        swapFee: '0.004',
        swapEnabled: true,
        totalShares: detailedPair.total_share,
        tokens: detailedPair.assets.map((asset) => ({
            address: parseAssetInfo(asset.info),
            balance: asset.amount,
            decimals: 6,
            weight: '0.5',
            priceRate: '',
        })),
        tokensList: detailedPair.asset_infos.map(parseAssetInfo),
        totalWeight: '1',
    };
};

(async () => {
    const oraiPoolsCachePath = path.join(
        __dirname,
        '../',
        'testData',
        'oraichain-pools.json'
    );
    let detailedPairInfos: SubgraphPoolBase[] = [];
    if (fs.existsSync(oraiPoolsCachePath)) {
        detailedPairInfos = JSON.parse(
            fs.readFileSync(oraiPoolsCachePath).toString('utf8')
        );
    } else {
        const client = await CosmWasmClient.connect('http://rpc.orai.io');
        const factoryV1 = new OraiswapFactoryQueryClient(
            client,
            FACTORY_CONTRACT
        );
        const factoryV2 = new OraiswapFactoryQueryClient(
            client,
            FACTORY_V2_CONTRACT
        );
        let pairInfos: PairInfo[] = [];
        const pairsV1 = (await factoryV1.pairs({ limit: 100 })).pairs;
        while (true) {
            const pairsV2 = (
                await factoryV2.pairs({
                    limit: 100,
                    startAfter:
                        pairInfos.length === 0
                            ? undefined
                            : pairInfos[pairInfos.length - 1].asset_infos,
                })
            ).pairs;
            if (pairsV2.length === 0) break;
            pairInfos = pairInfos.concat(pairsV2);
            console.log(pairInfos.length);
        }
        // console.log(pairsV1.length, pairsV2.length, morePairsV2.pairs.length);
        const pairs = PAIRS.map((pair) => pair.asset_infos);
        pairInfos = pairInfos
            .concat(pairsV1)
            .filter((pair) =>
                pairs.some((whitelistPair) =>
                    whitelistPair
                        .map(parseAssetInfo)
                        .every((wlPair) =>
                            pair.asset_infos
                                .map(parseAssetInfo)
                                .includes(wlPair)
                        )
                )
            );

        for (const pair of pairInfos) {
            const pairClient = new OraiswapPairQueryClient(
                client,
                pair.contract_addr
            );
            const poolResponse = await pairClient.pool();
            detailedPairInfos.push(
                mapOraichainPoolsToBalancerPools({ ...pair, ...poolResponse })
            );
        }
        fs.writeFileSync(oraiPoolsCachePath, JSON.stringify(detailedPairInfos));
    }
    const poolsDict = parseToPoolsDict(detailedPairInfos, 1000);
    const swapTypes = SwapTypes.SwapExactIn;
    const swapAmount = BigNumber.from(toAmount(1, 6));
    const maxPools = 5;
    // console.log(pools.map((pool) => pool.id));

    const tokenIn = ORAI;
    // const tokenOut = 'ETH';
    const tokenOut = USDC_CONTRACT;

    const [directPools, hopsIn, hopsOut] = filterPoolsOfInterest(
        poolsDict,
        tokenIn,
        tokenOut,
        maxPools
    );
    const producePathsResult = producePaths(
        tokenIn,
        tokenOut,
        directPools,
        hopsIn,
        hopsOut,
        poolsDict
    );

    const pathLimits = calculatePathLimits(producePathsResult, swapTypes);
    console.dir(
        { routes: pathLimits[0].map((path) => path.swaps) },
        { depth: null }
    );

    const [swaps, total, marketSp, totalConsideringFees] = getBestPaths(
        pathLimits[0],
        swapTypes,
        swapAmount,
        truncDecimals,
        truncDecimals,
        maxPools,
        BigNumber.from(100)
    );

    console.dir({ bestPaths: swaps }, { depth: null });

    const swapInfo = formatSwaps(
        swaps,
        swapTypes,
        swapAmount,
        tokenIn,
        tokenOut,
        parseFixed(
            total.dp(truncDecimals, OldBigNumber.ROUND_FLOOR).toString(),
            truncDecimals
        ),
        parseFixed(
            totalConsideringFees
                .dp(truncDecimals, OldBigNumber.ROUND_FLOOR)
                .toString(),
            truncDecimals
        ),
        marketSp.toString()
    );

    console.dir(
        {
            swapInfo: {
                ...swapInfo,
                swapAmount: swapInfo.swapAmount.toString(),
                swapAmountForSwaps: swapInfo.swapAmountForSwaps.toString(),
                returnAmount: swapInfo.returnAmount.toString(),
                returnAmountFromSwaps:
                    swapInfo.returnAmountFromSwaps.toString(),
                returnAmountConsideringFees:
                    swapInfo.returnAmountConsideringFees.toString(),
            },
        },
        { depth: null }
    );
})();
