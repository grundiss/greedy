import type { GlobalUpdate, Video, VideoWithUpdates } from '@greedy/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AccountGrowthTimeline } from '../components/reports/AccountGrowthTimeline';
import { NextActions } from '../components/reports/NextActions';
import { PortfolioMatrix } from '../components/reports/PortfolioMatrix';
import { PromotionRoi } from '../components/reports/PromotionRoi';
import { SelectedVideoDeepDive } from '../components/reports/SelectedVideoDeepDive';
import { SummaryCards } from '../components/reports/SummaryCards';
import { WhatWorksSection } from '../components/reports/WhatWorks';
import { api } from '../lib/api';
import {
  aggregateByCreativeAttribute,
  aggregateByDuration,
  aggregateByTag,
  buildAccountGrowthEvents,
  buildNextActions,
  buildPortfolioPoints,
  buildPromotionReport,
  buildVideoReportRows,
  median,
} from '../lib/reportAnalytics';

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedVideoId = searchParams.get('videoId') ?? '';

  const [videos, setVideos] = useState<Video[]>([]);
  const [allVideosWithUpdates, setAllVideosWithUpdates] = useState<VideoWithUpdates[]>([]);
  const [data, setData] = useState<VideoWithUpdates | null>(null);
  const [globalUpdates, setGlobalUpdates] = useState<GlobalUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const videoId = useMemo(() => {
    if (
      requestedVideoId &&
      (videos.length === 0 || videos.some((v) => String(v.id) === requestedVideoId))
    ) {
      return requestedVideoId;
    }
    return videos.length > 0 ? String(videos[0]!.id) : '';
  }, [requestedVideoId, videos]);

  function selectVideo(nextVideoId: string) {
    setSearchParams(nextVideoId ? { videoId: nextVideoId } : {});
  }

  useEffect(() => {
    api
      .listGlobalUpdates()
      .then((updates) => setGlobalUpdates(updates))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load global updates'),
      );

    api
      .listVideos()
      .then(async (vs) => {
        setVideos(vs);
        setError(null);
        const withUpdates = await Promise.all(vs.map((v) => api.getVideo(v.id)));
        setAllVideosWithUpdates(withUpdates);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load videos'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!videoId) {
      setData(null);
      return;
    }
    setData(null);
    api
      .getVideo(Number(videoId))
      .then((nextData) => {
        setData(nextData);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load video'));
  }, [videoId]);

  const reportRows = useMemo(
    () => buildVideoReportRows(allVideosWithUpdates),
    [allVideosWithUpdates],
  );

  const summary = useMemo(() => {
    const withUpdates = reportRows.filter((r) => r.dataQuality.hasUpdates).length;
    const promoted = reportRows.filter((r) => r.promoted).length;
    const medianF1k = median(
      reportRows.map((r) => r.followersPer1kViews).filter((v): v is number => v !== null),
    );
    const medianCostPerFollower = median(
      reportRows.map((r) => r.costPerPromotionFollower).filter((v): v is number => v !== null),
    );
    return { total: reportRows.length, withUpdates, promoted, medianF1k, medianCostPerFollower };
  }, [reportRows]);

  const nextActions = useMemo(() => buildNextActions(reportRows), [reportRows]);
  const portfolioPoints = useMemo(() => buildPortfolioPoints(reportRows), [reportRows]);
  const promotionReport = useMemo(() => buildPromotionReport(reportRows), [reportRows]);
  const accountGrowthEvents = useMemo(
    () => buildAccountGrowthEvents(reportRows, globalUpdates),
    [reportRows, globalUpdates],
  );

  const durationSegments = useMemo(() => aggregateByDuration(reportRows), [reportRows]);
  const tagSegments = useMemo(() => aggregateByTag(reportRows), [reportRows]);
  const hookSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'hookType'),
    [reportRows],
  );
  const faceSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'hasFace'),
    [reportRows],
  );
  const soundSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'soundType'),
    [reportRows],
  );
  const subtitleSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'subtitles'),
    [reportRows],
  );

  const selectedReportRow = useMemo(
    () => reportRows.find((r) => String(r.video.id) === videoId) ?? null,
    [reportRows, videoId],
  );
  const selectedPortfolioPoint = useMemo(
    () => portfolioPoints.find((p) => String(p.videoId) === videoId) ?? null,
    [portfolioPoints, videoId],
  );
  const selectedPromotionRow = useMemo(
    () => promotionReport.find((p) => String(p.videoId) === videoId) ?? null,
    [promotionReport, videoId],
  );

  const hasAnyUpdates = reportRows.some((r) => r.dataQuality.hasUpdates);
  const hasFollowerData = reportRows.some((r) => r.dataQuality.hasFollowers);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="mt-1 text-slate-500">What should you post, repeat, or promote next?</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!isLoading && videos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <p className="text-sm font-medium text-slate-600">
            Add your first video to start learning what grows your account.
          </p>
          <p className="mt-2 text-sm">
            <Link to="/videos" className="text-indigo-600 hover:underline">
              Go to Videos to add one.
            </Link>
          </p>
        </div>
      ) : null}

      {(isLoading || videos.length > 0) && (
        <>
          {!isLoading && !hasAnyUpdates && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Log views and new followers for a few videos to unlock recommendations.
            </div>
          )}

          {!isLoading && hasAnyUpdates && !hasFollowerData && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Reports work best when you log new followers per video. Views alone cannot tell which
              content grows the account.
            </div>
          )}

          <NextActions actions={nextActions} />

          <SummaryCards summary={summary} />

          <PortfolioMatrix points={portfolioPoints} />

          <WhatWorksSection
            durationSegments={durationSegments}
            tagSegments={tagSegments}
            hookSegments={hookSegments}
            faceSegments={faceSegments}
            soundSegments={soundSegments}
            subtitleSegments={subtitleSegments}
          />

          <PromotionRoi rows={promotionReport} />

          <AccountGrowthTimeline events={accountGrowthEvents} />

          <SelectedVideoDeepDive
            videos={videos}
            videoId={videoId}
            onSelectVideo={selectVideo}
            data={data}
            reportRow={selectedReportRow}
            portfolioPoint={selectedPortfolioPoint}
            promotionRow={selectedPromotionRow}
            globalUpdates={globalUpdates}
          />
        </>
      )}
    </div>
  );
}
