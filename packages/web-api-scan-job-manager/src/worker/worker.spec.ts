// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import 'reflect-metadata';

import { Batch, BatchConfig, JobTask, JobTaskState, Message, PoolLoadGenerator, Queue } from 'azure-services';
import { ServiceConfiguration } from 'common';
import * as _ from 'lodash';
import { BatchPoolMeasurements } from 'logger';
import { SystemDataProvider } from 'service-library';
import { BatchPoolLoadSnapshot, StorageDocument } from 'storage-documents';
import { IMock, It, Mock, Times } from 'typemoq';
import { MockableLogger } from '../test-utilities/mockable-logger';
import { Worker } from './worker';

// tslint:disable: no-unsafe-any no-object-literal-type-assertion no-null-keyword

let worker: Worker;
let batchMock: IMock<Batch>;
let queueMock: IMock<Queue>;
let poolLoadGeneratorMock: IMock<PoolLoadGenerator>;
let serviceConfigMock: IMock<ServiceConfiguration>;
let loggerMock: IMock<MockableLogger>;
let systemDataProviderMock: IMock<SystemDataProvider>;
const batchConfig: BatchConfig = {
    accountName: 'batch-account-name',
    accountUrl: '',
    poolId: 'pool-Id',
    jobId: 'batch-job-id',
    taskId: 'batch-task-id',
};
const activeToRunningTasksRatioDefault = 2;
const addTasksIntervalInSecondsDefault = 1;
const dateNow = new Date('2019-12-12T12:00:00.000Z');
let poolMetricsInfo = {
    id: 'pool-id',
    maxTasksPerPool: 4,
    load: {
        activeTasks: 4,
        runningTasks: 4,
    },
};
const poolLoadSnapshot = {
    isIdle: false,
    tasksIncrementCountPerInterval: 60,
    targetActiveToRunningTasksRatio: 2,
    configuredMaxTasksPerPool: poolMetricsInfo.maxTasksPerPool,
    targetMaxTasksPerPool: 8,
    poolId: poolMetricsInfo.id,
    samplingIntervalInSeconds: 5,
    tasksProcessingSpeedPerInterval: 7,
    tasksProcessingSpeedPerMinute: 13,
    poolFillIntervalInSeconds: 15,
    activityState: 1,
    timestamp: dateNow,
    ...poolMetricsInfo.load,
};

describe(Worker, () => {
    beforeEach(() => {
        batchMock = Mock.ofType(Batch);
        queueMock = Mock.ofType(Queue);
        poolLoadGeneratorMock = Mock.ofType(PoolLoadGenerator);
        serviceConfigMock = Mock.ofType(ServiceConfiguration);
        loggerMock = Mock.ofType(MockableLogger);
        systemDataProviderMock = Mock.ofType(SystemDataProvider);

        queueMock.setup(o => o.scanQueue).returns(() => 'scan-queue');

        serviceConfigMock
            .setup(async s => s.getConfigValue('jobManagerConfig'))
            .returns(async () => {
                return {
                    activeToRunningTasksRatio: activeToRunningTasksRatioDefault,
                    addTasksIntervalInSeconds: addTasksIntervalInSecondsDefault,
                    maxWallClockTimeInHours: 1,
                };
            })
            .verifiable(Times.atLeastOnce());

        poolLoadGeneratorMock
            .setup(async o => o.getPoolLoadSnapshot(1, poolMetricsInfo))
            .returns(async () => Promise.resolve(poolLoadSnapshot))
            .verifiable(Times.once());

        batchMock
            .setup(async o => o.createJobIfNotExists(batchConfig.jobId, true))
            .returns(async () => Promise.resolve(batchConfig.jobId))
            .verifiable(Times.once());

        worker = new Worker(
            batchMock.object,
            queueMock.object,
            poolLoadGeneratorMock.object,
            systemDataProviderMock.object,
            batchConfig,
            serviceConfigMock.object,
            loggerMock.object,
        );
        worker.runOnce = true;
    });

    afterEach(() => {
        batchMock.verifyAll();
        queueMock.verifyAll();
        serviceConfigMock.verifyAll();
        systemDataProviderMock.verifyAll();
    });

    it('add tasks to the job', async () => {
        const taskCount = 2;
        const queueMessages: Message[] = [];
        const jobTasks: JobTask[] = [];
        let scanMessagesCount = 0;
        for (let i = 1; i <= taskCount; i += 1) {
            const message = {
                messageText: '{}',
                messageId: `message-id-${i}`,
            };
            queueMessages.push(message);

            const jobTask = new JobTask();
            jobTask.state = JobTaskState.queued;
            jobTask.correlationId = message.messageId;
            jobTasks.push(jobTask);
        }
        batchMock
            .setup(async o => o.createTasks(batchConfig.jobId, queueMessages))
            .returns(async () => Promise.resolve(jobTasks))
            .verifiable(Times.once());
        batchMock
            .setup(async o => o.getPoolMetricsInfo())
            .returns(async () => Promise.resolve(poolMetricsInfo))
            .verifiable(Times.once());
        queueMock
            .setup(async o => o.getMessages())
            .callback(q => {
                scanMessagesCount += 1;
            })
            .returns(async () => {
                return queueMessages.length >= scanMessagesCount
                    ? Promise.resolve([queueMessages[scanMessagesCount - 1]])
                    : Promise.resolve([]);
            })
            .verifiable(Times.exactly(taskCount + 1));
        queueMock
            .setup(async o => o.deleteMessage(It.isAny()))
            .callback(message => {
                const i = queueMessages.indexOf(queueMessages.find(m => m.messageId === message.messageId));
                queueMessages.splice(i, 1);
            })
            .verifiable(Times.exactly(taskCount));
        const expectedMeasurements: BatchPoolMeasurements = {
            runningTasks: poolMetricsInfo.load.runningTasks,
            samplingIntervalInSeconds: poolLoadSnapshot.samplingIntervalInSeconds,
            maxParallelTasks: poolMetricsInfo.maxTasksPerPool,
        };
        loggerMock.setup(lm => lm.trackEvent('BatchPoolStats', null, expectedMeasurements)).verifiable(Times.once());
        setupSystemDataProviderMock();

        await worker.run();

        // should delete messages from the queue
        expect(queueMessages.length).toEqual(0);
        loggerMock.verifyAll();
    });

    it('skip adding tasks when pool is overloaded', async () => {
        poolLoadSnapshot.tasksIncrementCountPerInterval = 0;
        poolLoadGeneratorMock
            .setup(async o => o.getPoolLoadSnapshot(1, poolMetricsInfo))
            .returns(async () => Promise.resolve(poolLoadSnapshot))
            .verifiable(Times.once());
        batchMock
            .setup(async o => o.createTasks(batchConfig.jobId, It.isAny()))
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.never());
        batchMock
            .setup(async o => o.getPoolMetricsInfo())
            .returns(async () => Promise.resolve(poolMetricsInfo))
            .verifiable(Times.once());
        queueMock
            .setup(async o => o.getMessages())
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.never());
        queueMock.setup(async o => o.deleteMessage(It.isAny())).verifiable(Times.never());
        setupSystemDataProviderMock();

        await worker.run();

        // reset default setup
        poolLoadSnapshot.tasksIncrementCountPerInterval = 60;
    });

    it('skip adding tasks when message queue is empty', async () => {
        batchMock
            .setup(async o => o.createTasks(batchConfig.jobId, It.isAny()))
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.never());
        batchMock
            .setup(async o => o.getPoolMetricsInfo())
            .returns(async () => Promise.resolve(poolMetricsInfo))
            .verifiable(Times.once());
        queueMock
            .setup(async o => o.getMessages())
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.once());
        queueMock.setup(async o => o.deleteMessage(It.isAny())).verifiable(Times.never());
        setupSystemDataProviderMock();

        await worker.run();
    });

    it('Continue waiting until all active tasks are completed', async () => {
        let poolMetricsInfoCallbackCount = 0;
        poolMetricsInfo = {
            id: 'pool-id',
            maxTasksPerPool: 4,
            load: {
                activeTasks: 4,
                runningTasks: 4,
            },
        };
        poolLoadGeneratorMock
            .setup(async o =>
                o.getPoolLoadSnapshot(
                    1,
                    It.is(actualMetrics => {
                        return _.isEqual(poolMetricsInfo, actualMetrics);
                    }),
                ),
            )
            .returns(async () => Promise.resolve(poolLoadSnapshot))
            .verifiable(Times.exactly(2));
        batchMock
            .setup(async o => o.createTasks(batchConfig.jobId, It.isAny()))
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.never());
        batchMock
            .setup(async o => o.getPoolMetricsInfo())
            .callback(q => {
                poolMetricsInfoCallbackCount += 1;
            })
            .returns(async () => {
                if (poolMetricsInfoCallbackCount > 1) {
                    poolMetricsInfo.load.activeTasks = 0;
                    poolMetricsInfo.load.runningTasks = 1;

                    return Promise.resolve(poolMetricsInfo);
                } else {
                    return Promise.resolve(poolMetricsInfo);
                }
            })
            .verifiable(Times.exactly(2));
        setupSystemDataProviderMock(Times.exactly(2));

        queueMock
            .setup(async o => o.getMessages())
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.exactly(2));

        // let it exit by itself
        worker.runOnce = false;
        await worker.run();
    });

    it('Continue waiting until all running tasks are completed', async () => {
        let poolMetricsInfoCallbackCount = 0;
        poolMetricsInfo = {
            id: 'pool-id',
            maxTasksPerPool: 4,
            load: {
                activeTasks: 4,
                runningTasks: 4,
            },
        };
        poolLoadGeneratorMock
            .setup(async o =>
                o.getPoolLoadSnapshot(
                    1,
                    It.is(actualMetrics => {
                        return _.isEqual(poolMetricsInfo, actualMetrics);
                    }),
                ),
            )
            .returns(async () => Promise.resolve(poolLoadSnapshot))
            .verifiable(Times.exactly(2));
        batchMock
            .setup(async o => o.createTasks(batchConfig.jobId, It.isAny()))
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.never());
        batchMock
            .setup(async o => o.getPoolMetricsInfo())
            .callback(q => {
                poolMetricsInfoCallbackCount += 1;
            })
            .returns(async () => {
                if (poolMetricsInfoCallbackCount > 1) {
                    poolMetricsInfo.load.activeTasks = 1;
                    poolMetricsInfo.load.runningTasks = 0;

                    return Promise.resolve(poolMetricsInfo);
                } else {
                    return Promise.resolve(poolMetricsInfo);
                }
            })
            .verifiable(Times.exactly(2));
        setupSystemDataProviderMock(Times.exactly(2));

        queueMock
            .setup(async o => o.getMessages())
            .returns(async () => Promise.resolve([]))
            .verifiable(Times.exactly(2));

        // let it exit by itself
        worker.runOnce = false;
        await worker.run();
    });
});

function setupSystemDataProviderMock(times: Times = Times.once()): void {
    const document = {
        ...({} as StorageDocument),
        batchAccountName: batchConfig.accountName,
        ...poolLoadSnapshot,
    };

    systemDataProviderMock
        .setup(async o =>
            o.writeBatchPoolLoadSnapshot(
                It.is(d => {
                    return _.isEqual(document, d);
                }),
            ),
        )
        .verifiable(times);

    const lastPoolLoadSnapshot = { activityState: 1 } as BatchPoolLoadSnapshot;
    systemDataProviderMock
        .setup(async o => o.readBatchPoolLoadSnapshot(batchConfig.accountName, 'urlScanPool'))
        .returns(async () => Promise.resolve(lastPoolLoadSnapshot))
        .verifiable(times);
}
