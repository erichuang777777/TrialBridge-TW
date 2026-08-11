"use client";

/* ============================================================================
   The blocking demo gate (privacy audit finding #1, BLOCKER).

   It sits at the data-flow choke point on every surface that can send entered
   text to the model: the note/PDF/connect paths on the patient side, and the
   cohort screen. Extracted here rather than copied because the consent
   sentence IS the control — two surfaces wording it differently means one of
   them is wrong, and nobody would notice which.

   Non-dismissible by design: no outside-click, no escape hatch, unchecked box,
   and the synthetic sample as the visually primary action. The point is that
   the safe path is the easy one.
   ========================================================================== */

import { useState } from "react";

export default function DemoGate({
  onSample,
  onContinue,
  sampleLabel = "Use the sample patient (Margaret)",
  /** What the entered text would be used for, in the reader's terms. The rest
   *  of the sentence — processed by an AI service, not stored — is fixed,
   *  because that part is the disclosure and must not vary by surface. */
  purpose = "to generate trial matches",
  continueLabel = "Continue with a synthetic note",
}: {
  onSample: () => void;
  onContinue: () => void;
  sampleLabel?: string;
  purpose?: string;
  continueLabel?: string;
}) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="gate-overlay" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-panel">
        <div className="gate-head">
          <div className="demo-badge">DEMO · SYNTHETIC DATA ONLY</div>
          <h2 id="gate-title">This is a demo — synthetic data only</h2>
        </div>
        <div className="gate-body">
          <p>
            This build is for demonstration. <b>Please do not enter real patient information.</b> Anything you enter is processed by an AI service
            {` ${purpose}`}, and is not stored by Trial.
          </p>
          <label className="consent gate-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I understand, and I will not enter real patient information. I agree to the information I enter being processed to find matching
              trials.
            </span>
          </label>
        </div>
        <div className="gate-actions">
          <button type="button" className="btn go" onClick={onSample}>
            {sampleLabel}
          </button>
          <button type="button" className="ghost gate-continue" disabled={!agreed} onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
