package com.estudiemos.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

public class WidgetSyncJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        WidgetSyncManager.runJob(this, () -> jobFinished(params, false));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
