import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import {
  getFileDisplayName,
  FILE_SORT_NAME_ASC,
  FILE_SORT_NAME_DESC,
  FILE_SORT_DATE_ASC,
  FILE_SORT_DATE_DESC,
} from '../utils/libraryFileList';

/**
 * Collapsible Files + Graphs sections for the Library sidebar (#33 extraction).
 */
export default function LibrarySourcesPanel({
  filesSectionOpen,
  setFilesSectionOpen,
  graphsSectionOpen,
  setGraphsSectionOpen,
  files,
  filesLoading,
  error,
  displayFiles,
  fileSearchQuery,
  setFileSearchQuery,
  fileSort,
  setFileSort,
  selectedFiles,
  analyzing,
  deletingFiles,
  savedGraphs,
  graphData,
  saving,
  onOpenUpload,
  onSelectAllFiltered,
  onClearFileSelection,
  onDeleteSelected,
  onFileSelect,
  onFileListKeyDown,
  onAnalyzeClick,
  onSaveClick,
  onLoadGraph,
  shareViewerMode = false,
}) {
  return (
    <>
      {shareViewerMode && (
        <div className="library-share-viewer-sidebar-note" role="status">
          <p>
            <strong>Shared view.</strong> Uploads and saving are disabled.{' '}
            <Link to="/visualize">Open your library</Link> without share parameters
            to use the full Library.
          </p>
        </div>
      )}
      <section
        className="library-section"
        aria-labelledby="library-section-files"
      >
        <h3 id="library-section-files" className="library-section__title">
          <button
            type="button"
            className="library-section__toggle"
            onClick={() => setFilesSectionOpen((o) => !o)}
            aria-expanded={filesSectionOpen}
          >
            <span className="library-section__chevron" aria-hidden>
              {filesSectionOpen ? '▼' : '▶'}
            </span>
            Files
            {!filesLoading && files.length > 0
              ? ` (${files.length})`
              : ''}
          </button>
        </h3>
        {filesSectionOpen && (
          <div
            className="library-section__body file-list"
            aria-busy={filesLoading}
          >
            {shareViewerMode ? (
              <p className="no-files no-files--muted">
                File list is hidden in shared read-only view.
              </p>
            ) : filesLoading ? (
              <div
                className="file-list-skeleton"
                aria-hidden
              >
                <div className="file-list-skeleton__row" />
                <div className="file-list-skeleton__row" />
                <div className="file-list-skeleton__row" />
                <div className="file-list-skeleton__row" />
              </div>
            ) : error && error.startsWith('Failed to fetch files') ? (
              <p className="no-files no-files--muted">
                File list could not be loaded. Use Retry above.
              </p>
            ) : files.length === 0 ? (
              <div className="file-list-empty">
                <p className="file-list-empty__title">No uploaded files yet</p>
                <p className="file-list-empty__hint">
                  Upload text or Markdown from the home page to analyze them
                  here.
                </p>
                <Link className="file-list-empty__cta" to="/">
                  Go to home
                </Link>
              </div>
            ) : (
              <>
                <div className="library-file-toolbar">
                  <div className="library-file-toolbar__search">
                    <label className="sr-only" htmlFor="library-file-search">
                      Search files
                    </label>
                    <input
                      id="library-file-search"
                      type="search"
                      className="library-file-search-input"
                      placeholder="Search files…"
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                      autoComplete="off"
                      aria-label="Search files"
                    />
                  </div>
                  <div className="library-file-toolbar__sort">
                    <label className="sr-only" htmlFor="library-file-sort">
                      Sort files
                    </label>
                    <select
                      id="library-file-sort"
                      className="library-file-sort-select"
                      value={fileSort}
                      onChange={(e) => setFileSort(e.target.value)}
                      aria-label="Sort files"
                    >
                      <option value={FILE_SORT_NAME_ASC}>Name (A–Z)</option>
                      <option value={FILE_SORT_NAME_DESC}>Name (Z–A)</option>
                      <option value={FILE_SORT_DATE_DESC}>
                        Newest upload first
                      </option>
                      <option value={FILE_SORT_DATE_ASC}>
                        Oldest upload first
                      </option>
                    </select>
                  </div>
                </div>
                {fileSearchQuery.trim() && (
                  <p className="file-list-filter-hint" role="status">
                    Showing {displayFiles.length} of {files.length} files
                  </p>
                )}
                <div className="file-list-actions">
                  <button
                    type="button"
                    className="file-list-action-btn"
                    onClick={onSelectAllFiltered}
                    disabled={displayFiles.length === 0}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="file-list-action-btn"
                    onClick={onClearFileSelection}
                    disabled={selectedFiles.size === 0}
                  >
                    Clear selection
                  </button>
                </div>
                {displayFiles.length === 0 ? (
                  <div className="file-list-empty file-list-empty--compact">
                    <p>No files match your search.</p>
                    <button
                      type="button"
                      className="file-list-empty__cta file-list-empty__cta--btn"
                      onClick={() => setFileSearchQuery('')}
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="file-list-header">
                      <span className="file-list-header__count">
                        Selected: {selectedFiles.size} file
                        {selectedFiles.size === 1 ? '' : 's'}
                      </span>
                      <div className="file-list-header__actions">
                        <button
                          type="button"
                          className="library-toolbar-btn library-toolbar-btn--add"
                          onClick={onOpenUpload}
                        >
                          <span className="library-toolbar-btn__icon" aria-hidden>
                            +
                          </span>
                          Add new
                        </button>
                        <button
                          type="button"
                          className="library-toolbar-btn library-toolbar-btn--danger"
                          onClick={onDeleteSelected}
                          disabled={
                            selectedFiles.size === 0 || deletingFiles
                          }
                        >
                          {deletingFiles ? 'Deleting…' : 'Delete selected'}
                        </button>
                        <button
                          className="library-toolbar-btn library-toolbar-btn--primary"
                          type="button"
                          onClick={onAnalyzeClick}
                          disabled={analyzing || selectedFiles.size === 0}
                        >
                          {analyzing ? 'Analyzing…' : 'Analyze Selected'}
                        </button>
                      </div>
                    </div>
                    <ul
                      className="file-list-items"
                      onKeyDown={onFileListKeyDown}
                    >
                      {displayFiles.map((file, index) => (
                        <li
                          key={file.filename || file.id || index}
                          className={`file-item ${
                            selectedFiles.has(file) ? 'selected' : ''
                          }`}
                        >
                          <label className="file-label">
                            <input
                              type="checkbox"
                              className="file-item-checkbox"
                              checked={selectedFiles.has(file)}
                              onChange={() => onFileSelect(file)}
                            />
                            <span className="file-name">
                              {getFileDisplayName(file)}
                            </span>
                            {file.uploadDate && (
                              <span className="file-meta">
                                {new Date(
                                  file.uploadDate
                                ).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section
        className="library-section library-section--graphs"
        aria-labelledby="library-section-graphs"
      >
        <h3 id="library-section-graphs" className="library-section__title">
          <button
            type="button"
            className="library-section__toggle"
            onClick={() => setGraphsSectionOpen((o) => !o)}
            aria-expanded={graphsSectionOpen}
          >
            <span className="library-section__chevron" aria-hidden>
              {graphsSectionOpen ? '▼' : '▶'}
            </span>
            Graphs
            {savedGraphs.length > 0 ? ` (${savedGraphs.length})` : ''}
          </button>
        </h3>
        {graphsSectionOpen && (
          <div className="library-section__body saved-graphs-section">
            {graphData && !shareViewerMode && (
              <button
                onClick={onSaveClick}
                disabled={saving}
                className="save-current-button"
              >
                {saving ? 'Saving...' : 'Save Current Graph'}
              </button>
            )}
            <div className="saved-graphs">
              {shareViewerMode ? (
                <p className="no-saved-graphs">
                  Loading other saved graphs is disabled while viewing a shared link.
                </p>
              ) : savedGraphs.length === 0 ? (
                <p className="no-saved-graphs">No saved graphs yet.</p>
              ) : (
                savedGraphs.map((graph, index) => (
                  <div key={index} className="saved-graph-item">
                    <div className="graph-info">
                      <strong>{graph.metadata.name || 'Unnamed Graph'}</strong>
                      <small>
                        Nodes: {graph.metadata.nodeCount} |
                        Edges: {graph.metadata.edgeCount}
                      </small>
                      <small>
                        Saved:{' '}
                        {new Date(graph.metadata.generatedAt).toLocaleDateString()}
                      </small>
                    </div>
                    <button
                      onClick={() => onLoadGraph(graph.filename)}
                      className="load-button"
                    >
                      Load
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

const setStateBool = PropTypes.func.isRequired;

LibrarySourcesPanel.propTypes = {
  filesSectionOpen: PropTypes.bool.isRequired,
  setFilesSectionOpen: setStateBool,
  graphsSectionOpen: PropTypes.bool.isRequired,
  setGraphsSectionOpen: setStateBool,
  files: PropTypes.array.isRequired,
  filesLoading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  displayFiles: PropTypes.array.isRequired,
  fileSearchQuery: PropTypes.string.isRequired,
  setFileSearchQuery: PropTypes.func.isRequired,
  fileSort: PropTypes.string.isRequired,
  setFileSort: PropTypes.func.isRequired,
  selectedFiles: PropTypes.object.isRequired,
  analyzing: PropTypes.bool.isRequired,
  deletingFiles: PropTypes.bool.isRequired,
  savedGraphs: PropTypes.array.isRequired,
  graphData: PropTypes.object,
  saving: PropTypes.bool.isRequired,
  onOpenUpload: PropTypes.func.isRequired,
  onSelectAllFiltered: PropTypes.func.isRequired,
  onClearFileSelection: PropTypes.func.isRequired,
  onDeleteSelected: PropTypes.func.isRequired,
  onFileSelect: PropTypes.func.isRequired,
  onFileListKeyDown: PropTypes.func.isRequired,
  onAnalyzeClick: PropTypes.func.isRequired,
  onSaveClick: PropTypes.func.isRequired,
  onLoadGraph: PropTypes.func.isRequired,
  shareViewerMode: PropTypes.bool,
};

LibrarySourcesPanel.defaultProps = {
  error: null,
  graphData: null,
  shareViewerMode: false,
};
