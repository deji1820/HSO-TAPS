import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  approveClearanceWorkflow, getClearanceCertificate, getMedicalDocuments, getMedicalWorkflow,
  getMedicalWorkflows, saveClearanceAssessment, updateWorkflowRequirement,
} from "../services/api.js";
import { normalizeRole } from "../utils/roles.js";
import "../styles/pages/MedicalWorkflows.css";

const STATUS_LABEL = {
  queued: "In clinical queue", assessment: "Assessment required", provider_review: "Provider review",
  requirements_pending: "Requirements pending", ready_for_approval: "Ready for provider approval", approval_in_progress: "Approval in progress",
  approved: "Approved · certificate issued", completed: "Encounter completed", cancelled: "Cancelled",
};
const dateTime = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
function matchesRequirement(text, document) {
  const source = [document.documentTitle, document.category, document.name, JSON.stringify(document.submissionDetails || {})].filter(Boolean).join(" ").toLowerCase();
  const requirement = String(text || "").toLowerCase();
  const kinds = [
    [/chest\s*x[\s-]?ray|x[\s-]?ray/, /chest\s*x[\s-]?ray|x[\s-]?ray|radiograph/],
    [/\becg\b|\bekg\b/, /\becg\b|\bekg\b|electrocardiogram/],
    [/\bcbc\b|complete blood count/, /\bcbc\b|complete blood count/],
    [/urinalysis/, /urinalysis|urine\s*(test|analysis)/],
    [/fecalysis|stool/, /fecalysis|stool\s*(test|analysis)|stool\s*exam/],
    [/drug\s*test/, /drug\s*test|drug\s*screen/],
    [/medical certificate/, /medical certificate/],
    [/\bape\b|annual physical exam/, /\bape\b|annual physical exam/],
  ];
  const found = kinds.find(([pattern]) => pattern.test(requirement));
  return Boolean(found && found[1].test(source));
}
function hasCurrentExamDate(text, document) {
  const requirement = String(text || "").toLowerCase();
  const months = /ecg/.test(requirement) && /3 months/.test(requirement) ? 3 : /x[\s-]?ray/.test(requirement) && /6 months/.test(requirement) ? 6 : null;
  if (!months) return true;
  if (!document.examDate) return false;
  const date = new Date(document.examDate);
  if (Number.isNaN(date.getTime()) || date > new Date()) return false;
  const earliest = new Date();
  earliest.setMonth(earliest.getMonth() - months);
  return date >= earliest;
}
function certificateTitle(purpose) {
  const titles = {
    "OJT Medical Clearance": "ON-THE-JOB TRAINING CLEARANCE",
    "Sports Medical Clearance (U-WEEK, NFG)": "SPORTS MEDICAL CLEARANCE",
    "New Enrollee Clearance (Medical / Dental)": "NEW ENROLLEE MEDICAL AND DENTAL CLEARANCE",
  };
  return titles[purpose] || String(purpose || "Medical").toUpperCase();
}

export default function MedicalWorkflowsPage({ user }) {
  const [params, setParams] = useSearchParams();
  const workflowId = params.get("workflowId");
  const [workflows, setWorkflows] = useState([]);
  const [workflow, setWorkflow] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [certificate, setCertificate] = useState(null);
  const [assessment, setAssessment] = useState({ physicalExam: "", laboratoryExamination: "", notes: "" });
  const [providerStatement, setProviderStatement] = useState("");
  const [evidence, setEvidence] = useState({});
  const [conditionalReasons, setConditionalReasons] = useState({});
  const [documentIds, setDocumentIds] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const role = normalizeRole(user?.role);
  const canAssess = ["nurse", "supervisor"].includes(role);
  const canApprove = role === "physician";
  const approvalOwnerId = typeof workflow?.providerApproval?.approvedBy === "string" ? workflow.providerApproval.approvedBy : workflow?.providerApproval?.approvedBy?._id;
  const canResumeApproval = canApprove && workflow?.status === "approval_in_progress" && approvalOwnerId === user?.id;

  async function refresh() {
    setError("");
    try {
      const [rows, docs] = await Promise.all([getMedicalWorkflows(), getMedicalDocuments()]);
      setWorkflows(rows);
      setDocuments(docs);
      if (workflowId) {
        const selected = await getMedicalWorkflow(workflowId);
        setWorkflow(selected);
        setAssessment({ physicalExam: selected.assessment?.physicalExam || "", laboratoryExamination: selected.assessment?.laboratoryExamination || "", notes: selected.assessment?.notes || "" });
        setProviderStatement(selected.providerStatement || "");
        setCertificate(selected.status === "approved" ? await getClearanceCertificate(workflowId) : null);
      } else setWorkflow(null);
    } catch (loadError) {
      setError(loadError.response?.data?.message || "Unable to load medical workflows. Check the connection and your access.");
    }
  }

  useEffect(() => { refresh(); }, [workflowId]);

  const patientDocuments = useMemo(() => documents.filter((item) => item.student?._id === workflow?.student?._id && item.status === "Verified"), [documents, workflow]);
  const completedSteps = workflow?.service === "Medical Clearance"
    ? Number(Boolean(workflow.assessment?.recordedAt)) + workflow.requirements.filter((item) => item.required ? item.status === "satisfied" : item.conditional && ["satisfied", "not_applicable"].includes(item.status)).length + Number(Boolean(workflow.providerApproval?.approvedAt))
    : Number(Boolean(workflow?.queueEntry)) + Number(workflow?.queueEntry?.status === "completed");
  const totalSteps = workflow?.service === "Medical Clearance" ? 2 + workflow.requirements.filter((item) => item.required || item.conditional).length : 2;

  async function run(action) {
    setBusy(true); setError("");
    try { await action(); await refresh(); }
    catch (actionError) { setError(actionError.response?.data?.message || "The update could not be saved. Review the required information and try again."); }
    finally { setBusy(false); }
  }

  async function verifyRequirement(index, item, status = "satisfied") {
    const payload = { status, evidence: status === "not_applicable" ? conditionalReasons[index] || "" : evidence[index] || "" };
    if (item.kind === "document" && status === "satisfied") payload.documentId = documentIds[index];
    await run(() => updateWorkflowRequirement(workflow._id, index, payload));
  }

  return <main className="medical-workflows-page">
    <header className="medical-workflows-header"><div><p className="workflow-eyebrow">Clinical operations</p><h1>Medical Workflows</h1><p>Track new medical records through the patient queue or clearance review.</p></div><div className="workflow-header-actions"><Link className="btn btn-outline" to="/new-record">New Medical Record</Link><button className="btn btn-outline" onClick={refresh} disabled={busy}>Refresh</button></div></header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <div className="workflow-layout">
      <aside className="workflow-list card"><h2>Recent workflows</h2>{workflows.length ? workflows.map((row) => <button className={`workflow-list-row${row._id === workflowId ? " selected" : ""}`} key={row._id} onClick={() => setParams({ workflowId: row._id })}><strong>{row.student?.lastName}, {row.student?.firstName}</strong><span>{row.service === "Medical Clearance" ? row.purpose : row.service}</span><small>{row.student?.studentId} · {STATUS_LABEL[row.status] || row.status}</small></button>) : <p className="workflow-empty">No medical workflows have been started.</p>}</aside>
      {!workflow ? <section className="workflow-empty-panel card"><h2>Select a workflow</h2><p>Choose a record to review progress, or start one from New Medical Record.</p><Link className="btn btn-primary" to="/new-record">Start new record</Link></section> : <article className="workflow-detail">
        <section className="workflow-patient card"><div><p className="workflow-eyebrow">{workflow.service}</p><h2>{workflow.student?.lastName}, {workflow.student?.firstName}</h2><p>{workflow.student?.studentId} · {workflow.student?.affiliation} · {workflow.student?.department || workflow.student?.program || "Department not recorded"}</p><strong>{workflow.service === "Medical Clearance" ? workflow.purpose : workflow.purpose}</strong></div><span className={`workflow-status status-${workflow.status}`}>{STATUS_LABEL[workflow.status] || workflow.status}</span></section>
        <section className="workflow-progress card"><div><h3>Progress</h3><span>{completedSteps} of {totalSteps} required steps</span></div><progress value={completedSteps} max={totalSteps || 1} /></section>

        {workflow.service !== "Medical Clearance" ? <section className="card workflow-next-step"><h3>Clinical consultation</h3><p>This record is linked to queue entry <strong>{workflow.queueEntry?.queueNumber || "—"}</strong>, currently <strong>{workflow.queueEntry?.status?.replaceAll("_", " ") || "waiting"}</strong>.</p><p>The queue handles nursing assessment and the matching {workflow.service === "Dental Consultation" ? "dentist" : "physician"} consultation. The encounter must include diagnosis and treatment plan before completion.</p><div className="workflow-links"><Link className="btn btn-primary" to="/dashboard">Open clinical queue</Link><Link className="btn btn-outline" to={`/emr?studentId=${workflow.student?.studentId}`}>Open patient EMR</Link></div>{workflow.status === "completed" && <p className="workflow-success">Encounter completed · Diagnosis: {workflow.diagnosis} · Treatment: {workflow.treatment}</p>}{workflow.status === "cancelled" && <p className="workflow-error">This queue visit was cancelled.</p>}</section> : <>
          <section className="card">
            <h3>Clearance requirements - {workflow.affiliation}</h3>
            <p className="workflow-muted">Only verified documents of the matching type can satisfy a document requirement. Conditional requirements must be marked complete or recorded as not applicable with a reason before provider approval.</p>
            <Link className="btn btn-outline btn-sm" to="/medical-documents">Review patient documents</Link>
            <ul className="workflow-requirements">
              {workflow.requirements.map((item, index) => {
                const actionable = item.kind !== "guidance" || item.conditional;
                const editable = canAssess && !["approval_in_progress", "approved", "completed"].includes(workflow.status) && actionable && item.status === "pending";
                return <li key={`${item.text}-${index}`}>
                  <div><strong>{item.text}</strong><small>{item.conditional ? `Conditional - ${item.condition}` : item.required ? "Required" : "Guidance"} ? {item.status.replaceAll("_", " ")}</small>{item.evidence && <small>Recorded: {item.evidence}</small>}</div>
                  {editable && <div className="workflow-requirement-control">
                    {item.kind === "document" ? <select className="text-input" value={documentIds[index] || ""} onChange={(event) => setDocumentIds((old) => ({ ...old, [index]: event.target.value }))}><option value="">Select matching verified patient document</option>{patientDocuments.filter((doc) => matchesRequirement(item.text, doc) && hasCurrentExamDate(item.text, doc)).map((doc) => <option key={doc._id} value={doc._id}>{doc.documentTitle || doc.name} ? {doc.category || "Document"}</option>)}</select> : <input className="text-input" placeholder="Completion note" value={evidence[index] || ""} onChange={(event) => setEvidence((old) => ({ ...old, [index]: event.target.value }))} />}
                    <button className="btn btn-outline btn-sm" disabled={busy || (item.kind === "document" && !documentIds[index]) || (item.kind === "action" && !evidence[index]?.trim())} onClick={() => verifyRequirement(index, item)}>Mark complete</button>
                    {item.conditional && <><input className="text-input" placeholder="Reason if not applicable" value={conditionalReasons[index] || ""} onChange={(event) => setConditionalReasons((old) => ({ ...old, [index]: event.target.value }))} /><button className="btn btn-outline btn-sm" disabled={busy || !conditionalReasons[index]?.trim()} onClick={() => verifyRequirement(index, item, "not_applicable")}>Mark not applicable</button></>}
                  </div>}
                </li>;
              })}
            </ul>
            {workflow.requirements.length === 0 && <p>No additional requirements are listed for this purpose; assessment and provider approval are still required.</p>}
          </section>
          {canAssess && !["approval_in_progress", "approved", "completed"].includes(workflow.status) && <section className="card workflow-assessment"><h3>Nursing assessment</h3><p>A physical or laboratory examination is required. Add any related notes before provider review.</p><label>Physical examination<textarea className="text-input" rows="3" value={assessment.physicalExam} onChange={(event) => setAssessment((old) => ({ ...old, physicalExam: event.target.value }))} /></label><label>Laboratory examination<textarea className="text-input" rows="3" value={assessment.laboratoryExamination} onChange={(event) => setAssessment((old) => ({ ...old, laboratoryExamination: event.target.value }))} /></label><label>Assessment notes<textarea className="text-input" rows="3" value={assessment.notes} onChange={(event) => setAssessment((old) => ({ ...old, notes: event.target.value }))} /></label><button className="btn btn-primary" disabled={busy || (!assessment.physicalExam.trim() && !assessment.laboratoryExamination.trim())} onClick={() => run(() => saveClearanceAssessment(workflow._id, assessment))}>Save assessment</button></section>}
          {canApprove && (workflow.status === "ready_for_approval" || canResumeApproval) && <section className="card workflow-approval"><h3>Provider approval</h3><p>{canResumeApproval ? "Approval is in progress for your account. Resume to finish saving the approved medical record and certificate." : "Required assessments and documents are complete. Record the provider determination before issuing the certificate."}</p><label>Provider determination<textarea className="text-input" rows="3" value={providerStatement} disabled={canResumeApproval} onChange={(event) => setProviderStatement(event.target.value)} placeholder="Enter the provider's clearance assessment and any restrictions." /></label><button className="btn btn-primary" disabled={busy || providerStatement.trim().length < 10} onClick={() => { if (window.confirm(`Approve and issue the ${workflow.purpose} certificate for ${workflow.student?.firstName} ${workflow.student?.lastName}?`)) run(() => approveClearanceWorkflow(workflow._id, providerStatement)); }}>{canResumeApproval ? "Finish approval and issue certificate" : "Approve clearance and issue certificate"}</button></section>}
          {workflow.status === "approved" && certificate && <section className="clearance-certificate card" id="clearance-certificate"><header><img src="/nu-fairview-crest.png" alt="National University Fairview crest" /><div><p>NATIONAL UNIVERSITY FAIRVIEW</p><h2>HEALTH SERVICES OFFICE</h2><h1>{certificateTitle(certificate.purpose)}</h1><strong>MEDICAL CLEARANCE CERTIFICATE · {certificate.purpose}</strong></div></header><p className="workflow-muted">Certificate reference: {certificate.workflowId}</p><p className="certificate-body">This is to certify that <strong>{certificate.patient.firstName} {certificate.patient.lastName}</strong> ({certificate.patient.affiliation} ID: {certificate.patient.studentId}){certificate.patient.program || certificate.patient.department ? ` of ${certificate.patient.program || certificate.patient.department}` : ""} has completed the recorded requirements for <strong>{certificate.purpose}</strong> and was approved by the authorized Health Services Office provider.</p><p><strong>Provider determination:</strong> {certificate.providerStatement}</p><p>Issued on {new Date(certificate.issueDate).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })}.</p><div className="certificate-signature"><strong>{certificate.provider.providerName}</strong><span>{certificate.provider.providerRole === "physician" || certificate.provider.providerRole === "doctor" ? "Physician" : certificate.provider.providerRole}</span><span>Authorized HSO Provider</span></div><button className="btn btn-primary certificate-print" onClick={() => window.print()}>Print / Save as PDF</button></section>}
        </>}
        <section className="card workflow-history"><h3>Workflow history</h3><ol>{[...(workflow.events || [])].reverse().map((event, index) => <li key={`${event._id || event.type}-${index}`}><strong>{event.description}</strong><span>{dateTime(event.at)}{event.actor?.name ? ` · ${event.actor.name}` : ""}</span></li>)}</ol></section>
        <div className="workflow-footer-links"><Link to="/medical-workflows">All workflows</Link><Link to={`/emr?studentId=${workflow.student?.studentId}`}>Patient EMR</Link></div>
      </article>}
    </div>
  </main>;
}
