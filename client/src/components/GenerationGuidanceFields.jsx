import PropTypes from 'prop-types';
import { GUIDANCE_PRESET_SELECT_OPTIONS } from '../utils/generationGuidance';
import './GenerationGuidanceFields.css';

/**
 * Preset dropdown + optional custom textarea (same UX as GraphVisualization AI Generation).
 */
function GenerationGuidanceFields({
  idPrefix,
  label,
  showOptionalHint,
  preset,
  onPresetChange,
  customText,
  onCustomTextChange,
  disabled,
  helpText,
  className,
}) {
  const helpId = `${idPrefix}-context-help`;
  const presetId = `${idPrefix}-preset`;
  const customId = `${idPrefix}-custom`;

  return (
    <div
      className={`form-group graph-generate-guidance${className ? ` ${className}` : ''}`}
    >
      <label htmlFor={presetId}>
        {label}{' '}
        {showOptionalHint && (
          <span className="graph-generate-guidance__hint">(optional)</span>
        )}
      </label>
      <select
        id={presetId}
        value={preset}
        onChange={e => onPresetChange(e.target.value)}
        disabled={disabled}
        aria-describedby={helpId}
      >
        {GUIDANCE_PRESET_SELECT_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <textarea
          id={customId}
          className="graph-generate-guidance__custom"
          rows={4}
          maxLength={2000}
          value={customText}
          onChange={e => onCustomTextChange(e.target.value)}
          placeholder="e.g. Prefer causal links and chemistry terms; favor playful topics when several fit the anchors."
          disabled={disabled}
          aria-describedby={helpId}
        />
      )}
      <p id={helpId} className="graph-generate-guidance__meta">
        {helpText}
      </p>
    </div>
  );
}

GenerationGuidanceFields.propTypes = {
  idPrefix: PropTypes.string.isRequired,
  label: PropTypes.node,
  showOptionalHint: PropTypes.bool,
  preset: PropTypes.string.isRequired,
  onPresetChange: PropTypes.func.isRequired,
  customText: PropTypes.string.isRequired,
  onCustomTextChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  helpText: PropTypes.node.isRequired,
  className: PropTypes.string,
};

GenerationGuidanceFields.defaultProps = {
  label: 'Guidance for this run',
  showOptionalHint: true,
  disabled: false,
  className: '',
};

export default GenerationGuidanceFields;
