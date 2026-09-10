const { ZMonitorServer } = require("./zmonitor-server");
const { clearOldData } = require("./jobs/clear-old-data");
const { incrementalVacuum } = require("./jobs/incremental-vacuum");
const { SelfHealth } = require("./self-health");
const { log } = require("../src/util");
const Cron = require("croner");

/**
 * Wraps a job function so its run (success or failure) is recorded for
 * self-health reporting, without modifying the job function itself.
 * @param {string} jobName Job name, matches the job's own `name` field
 * @param {Function} jobFunc The job function to wrap
 * @returns {Function} Wrapped job function
 */
const withHealthTracking = (jobName, jobFunc) => {
    return async (...args) => {
        try {
            await jobFunc(...args);
            SelfHealth.recordSchedulerRun(jobName, null);
        } catch (error) {
            log.error("jobs", `Job "${jobName}" failed: ${error.message}`);
            SelfHealth.recordSchedulerRun(jobName, error);
        }
    };
};

const jobs = [
    {
        name: "clear-old-data",
        interval: "14 03 * * *",
        jobFunc: clearOldData,
        croner: null,
    },
    {
        name: "incremental-vacuum",
        interval: "*/5 * * * *",
        jobFunc: incrementalVacuum,
        croner: null,
    },
];

/**
 * Initialize background jobs
 * @returns {Promise<void>}
 */
const initBackgroundJobs = async function () {
    const timezone = await ZMonitorServer.getInstance().getTimezone();

    for (const job of jobs) {
        const cornerJob = new Cron(
            job.interval,
            {
                name: job.name,
                timezone,
            },
            withHealthTracking(job.name, job.jobFunc)
        );
        job.croner = cornerJob;
    }
};

/**
 * Stop all background jobs if running
 * @returns {void}
 */
const stopBackgroundJobs = function () {
    for (const job of jobs) {
        if (job.croner) {
            job.croner.stop();
            job.croner = null;
        }
    }
};

module.exports = {
    initBackgroundJobs,
    stopBackgroundJobs,
};
