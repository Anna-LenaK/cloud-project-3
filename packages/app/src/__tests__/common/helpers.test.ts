/*
 * © 2021 Thoughtworks, Inc.
 */

import {
  getCachedData,
  writeToFile,
  getCacheFileName,
  getMissingDates,
  includeCloudProviders,
  mergeEstimates,
} from '../../common/helpers'
import { Readable, Stream } from 'stream'
import { EstimationResult, GroupBy } from '@cloud-carbon-footprint/common'
import { EstimationRequest } from '../../CreateValidRequest'
import moment from 'moment'

describe('common/helpers.ts', () => {
  it('reads cached data formatted with [] and newlines separators', async () => {
    const mockData = Readable.from([
      '[\n',
      '{"this": "that", "timestamp": "2020-01-01"}',
      '\n]',
    ])

    const cachedData = await getCachedData(mockData)

    const expectedData = [{ this: 'that', timestamp: new Date('2020-01-01') }]

    expect(cachedData).toEqual(expectedData)
  })

  it('writes cache file with correct separators', async () => {
    const dataToBeCached: EstimationResult[] = [
      {
        timestamp: new Date('2020-01-01'),
        serviceEstimates: [],
        periodStartDate: undefined,
        periodEndDate: undefined,
        groupBy: GroupBy.day,
      },
    ]

    // intercept file writing calls
    const writable = new Stream.Writable()
    let cachedData = ''
    writable._write = (chunk, encoding, next) => {
      cachedData += chunk.toString()
      next()
    }

    await writeToFile(writable, dataToBeCached)

    const expectedCachedString =
      '[\n{"timestamp":"2020-01-01T00:00:00.000Z","serviceEstimates":[],"groupBy":"day"}\n]'

    expect(cachedData).toEqual(expectedCachedString)
  })

  describe('getCacheFile', () => {
    const OLD_ENV = process.env
    beforeEach(() => {
      jest.resetModules() // Most important - it clears the cache
      process.env = { ...OLD_ENV } // Make a copy
    })

    afterAll(() => {
      process.env = OLD_ENV // Restore old environment
    })

    it('should use the default prefix if a hard-coded one is not provided', async () => {
      const cacheFile = getCacheFileName('day')
      expect(cacheFile).toEqual('estimates.cache.day.json')
    })

    it('should alter the hard-coded cache path if one is provided', async () => {
      process.env.CCF_CACHE_PATH = 'my-cache-file.json'
      const cacheFile = getCacheFileName('day')
      expect(cacheFile).toEqual('my-cache-file.day.json')
    })
  })

  it('gets missing dates', () => {
    const estimates: EstimationResult[] = [
      {
        timestamp: new Date('2020-01-01'),
        serviceEstimates: [],
        periodStartDate: undefined,
        periodEndDate: undefined,
        groupBy: GroupBy.day,
      },
    ]

    const request: EstimationRequest = {
      startDate: new Date('2022-01-02'),
      endDate: new Date('2022-01-02'),
      ignoreCache: false,
      groupBy: 'day',
      skip: 0,
      limit: 1,
    }

    const missingDates = getMissingDates(estimates, request, 'day')
    const expectedDate = moment.utc(request.startDate).startOf('day')

    expect(missingDates).toEqual([moment.utc(expectedDate.toDate())])
  })

  it('modifies config for included cloud providers based on seed value', () => {
    const config = {
      AWS: {
        INCLUDE_ESTIMATES: false,
      },
      GCP: {
        INCLUDE_ESTIMATES: true,
      },
      AZURE: {
        INCLUDE_ESTIMATES: true,
      },
    }
    const cloudProviderToSeed = 'AWS'

    includeCloudProviders(cloudProviderToSeed, config)

    expect(config.AWS.INCLUDE_ESTIMATES).toBe(true)
    expect(config.GCP.INCLUDE_ESTIMATES).toBe(false)
    expect(config.AZURE.INCLUDE_ESTIMATES).toBe(false)
  })

  describe('merging estimates', () => {
    const emptyArray = []
    const singleEstimateArrayOne = [
      {
        timestamp: new Date('2022-01-01'),
        serviceEstimates: [
          {
            cloudProvider: 'AWS',
            kilowattHours: 120,
            co2e: 0.5,
            cost: 100,
            accountId: '1111111111',
            accountName: 'Test Account',
            serviceName: 'EC2',
            region: 'us-east-1',
          },
        ],
        groupBy: GroupBy.day,
      },
    ]
    const singleEstimateArrayTwo = [
      {
        timestamp: new Date('2022-01-01'),
        serviceEstimates: [
          {
            cloudProvider: 'AWS',
            kilowattHours: 100,
            co2e: 0.1,
            cost: 50,
            accountId: '2222222222',
            accountName: 'Other Test Account',
            serviceName: 'EC2',
            region: 'us-east-1',
          },
        ],
        groupBy: GroupBy.day,
      },
    ]
    const mockEstimatesArrayOne = [
      {
        timestamp: new Date('2022-01-01'),
        serviceEstimates: [],
        groupBy: GroupBy.day,
      },
      {
        timestamp: new Date('2022-01-03'),
        serviceEstimates: [],
        groupBy: GroupBy.day,
      },
    ]
    const mockEstimatesArrayTwo = [
      {
        timestamp: new Date('2022-01-02'),
        serviceEstimates: [],
        groupBy: GroupBy.day,
      },
      {
        timestamp: new Date('2022-01-04'),
        serviceEstimates: [],
        groupBy: GroupBy.day,
      },
    ]

    const mergedEstimatesExample = [
      mockEstimatesArrayOne[0],
      mockEstimatesArrayTwo[0],
      mockEstimatesArrayOne[1],
      mockEstimatesArrayTwo[1],
    ]

    it.each([
      [
        'should return an empty array when both input arrays are empty',
        emptyArray,
        emptyArray,
        emptyArray,
      ],
      [
        'should return the first array when the second array is empty',
        singleEstimateArrayOne,
        emptyArray,
        singleEstimateArrayOne,
      ],
      [
        'should return the second array when the first array is empty',
        emptyArray,
        singleEstimateArrayOne,
        singleEstimateArrayOne,
      ],
      [
        'should return first estimate of first array when timestamps are equal',
        singleEstimateArrayOne,
        singleEstimateArrayTwo,
        [...singleEstimateArrayOne],
      ],
      [
        'should merge two arrays with alternating timestamps',
        mockEstimatesArrayOne,
        mockEstimatesArrayTwo,
        mergedEstimatesExample,
      ],
    ])('%s', (_testCase, estimatesOne, estimatesTwo, expected) => {
      const result = mergeEstimates(estimatesOne, estimatesTwo)
      expect(result).toEqual(expected)
    })
  })
})
