import { useState } from 'react';
import { Download, Trash2, RefreshCw } from 'lucide-react';
import { quizAnalyticsDb } from '../../db/quizAnalyticsDb';
import { OverviewStats } from './OverviewStats';
import { TopicPerformanceComponent } from './TopicPerformance';
import { ScoreTrends } from './ScoreTrends';
import { QuestionInsights } from './QuestionInsights';
import { AchievementsComponent } from './Achievements';
import './QuizAnalyticsPage.css';

export function QuizAnalyticsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleExportCSV() {
    try {
      const csv = await quizAnalyticsDb.exportToCSV();
      
      // Create download link
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quiz-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('✅ Quiz data exported to CSV');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export quiz data');
    }
  }

  async function handleClearData() {
    const confirmed = confirm(
      'Are you sure you want to delete all quiz analytics data? This cannot be undone.\n\n' +
      'Recommendation: Export your data first using the Export CSV button.'
    );

    if (!confirmed) return;

    const doubleConfirmed = confirm(
      'FINAL WARNING: This will permanently delete:\n' +
      '- All quiz results\n' +
      '- Topic performance data\n' +
      '- Achievements\n' +
      '- Study streaks\n\n' +
      'Are you absolutely sure?'
    );

    if (!doubleConfirmed) return;

    try {
      await quizAnalyticsDb.clearAllData();
      setRefreshKey(prev => prev + 1); // Force refresh all components
      console.log('✅ All quiz analytics data cleared');
      alert('All quiz analytics data has been deleted');
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear quiz analytics data');
    }
  }

  function handleRefresh() {
    setRefreshKey(prev => prev + 1);
  }

  return (
    <div className="quiz-analytics-page" key={refreshKey}>
      {/* Header with actions */}
      <div className="analytics-header">
        <div>
          <h1>Quiz Analytics</h1>
          <p className="subtitle">Track your learning progress and performance</p>
        </div>
        <div className="actions">
          <button className="btn-action btn-refresh" onClick={handleRefresh} title="Refresh data">
            <RefreshCw size={18} />
            <span>Refresh</span>
          </button>
          <button className="btn-action btn-export" onClick={handleExportCSV} title="Export data to CSV">
            <Download size={18} />
            <span>Export CSV</span>
          </button>
          <button className="btn-action btn-danger" onClick={handleClearData} title="Delete all analytics data">
            <Trash2 size={18} />
            <span>Clear Data</span>
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <OverviewStats />

      {/* Score Trends */}
      <ScoreTrends />

      {/* Topic Performance */}
      <TopicPerformanceComponent />

      {/* Question Insights */}
      <QuestionInsights />

      {/* Achievements */}
      <AchievementsComponent />
    </div>
  );
}
