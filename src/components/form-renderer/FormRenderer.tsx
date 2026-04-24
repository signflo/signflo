"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import type {
  AgreementField,
  AgreementSchema,
  FieldGroup,
  SignatureBlock,
} from "@/lib/vision/types";
import { useDraftSave, type DraftSaveStatus } from "./useDraftSave";

interface Props {
  agreementId: string;
  shortId: string;
  schema: AgreementSchema;
  lowConfidenceFieldIds?: string[];
  /** When rendering a resumed draft, the token identifying it. */
  initialDraftToken?: string;
  /** Pre-filled values from a saved draft (keyed by form-field name). */
  initialValues?: Record<string, unknown>;
}

type FormValues = Record<string, string | boolean>;

/**
 * Build the unique form-field name for a field inside a group instance.
 * Flat submission storage; the grouped structure is derived by id shape.
 */
function groupFieldName(groupId: string, instance: number, fieldId: string) {
  return `${groupId}__${instance}__${fieldId}`;
}

/**
 * Split flat fields into a leading bucket of section-less fields and an
 * ordered list of `{section, fields}` groupings. Section order follows
 * first-appearance in the schema's field array — preserves authorial intent
 * for documents like TruGreen where the section order matters semantically.
 */
function groupFieldsBySection(fields: AgreementField[]) {
  const flat: AgreementField[] = [];
  const sectionOrder: string[] = [];
  const bySectionMap = new Map<string, AgreementField[]>();
  for (const f of fields) {
    if (!f.section) {
      flat.push(f);
      continue;
    }
    if (!bySectionMap.has(f.section)) {
      sectionOrder.push(f.section);
      bySectionMap.set(f.section, []);
    }
    bySectionMap.get(f.section)!.push(f);
  }
  return {
    flat,
    bySection: sectionOrder.map((section) => ({
      section,
      fields: bySectionMap.get(section)!,
    })),
  };
}

export function FormRenderer({
  agreementId,
  shortId,
  schema,
  lowConfidenceFieldIds = [],
  initialDraftToken,
  initialValues,
}: Props) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    mode: "onBlur",
    defaultValues: mergeDefaults(schema, initialValues),
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pauseAutoSave, setPauseAutoSave] = useState(false);
  const lowConfSet = new Set(lowConfidenceFieldIds);

  // Watch all form values so useDraftSave can debounce-save them.
  const watchedValues = watch();
  const draftSave = useDraftSave({
    agreementId,
    initialDraftToken: initialDraftToken ?? null,
    data: watchedValues as Record<string, unknown>,
    paused: pauseAutoSave || isSubmitting,
  });

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setSubmitError(null);
    // Stop auto-save during and after final submit so we don't race the
    // POST to /api/submissions with a POST to /api/drafts.
    setPauseAutoSave(true);

    const fd = new FormData();
    fd.append("agreementId", agreementId);
    if (draftSave.draftToken) {
      fd.append("draftToken", draftSave.draftToken);
    }

    for (const field of schema.fields) {
      appendFieldValue(fd, field, field.id, values);
    }

    for (const group of schema.fieldGroups) {
      for (let i = 0; i < group.initialInstances; i++) {
        for (const field of group.template) {
          const name = groupFieldName(group.id, i, field.id);
          appendFieldValue(fd, field, name, values);
        }
      }
    }

    const res = await fetch("/api/submissions", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setSubmitError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    const body = await res.json();
    // Prefer the owner-token URL when the API provides one. Fall back to the
    // Phase B confirmation page if token minting ever fails.
    const target =
      typeof body.ownerUrl === "string" && body.ownerUrl.length > 0
        ? body.ownerUrl
        : `/a/${shortId}/complete?submission=${body.submissionShortId}`;
    window.location.href = target;
  };

  // If most fields are low-confidence, show a single banner at the top
  // and suppress per-field amber badges (which would otherwise read as
  // "everything's wrong" on a poorly-photographed source).
  const totalFieldCount =
    schema.fields.length +
    schema.fieldGroups.reduce((s, g) => s + g.template.length * g.initialInstances, 0);
  const showLowConfBanner =
    totalFieldCount > 0 && lowConfidenceFieldIds.length / totalFieldCount > 0.5;
  const effectiveLowConfSet = showLowConfBanner ? new Set<string>() : lowConfSet;

  // Group flat fields by their `section` (if any) so the renderer can show
  // h2 headings between sections. Fields without a section land in a
  // leading "no-section" bucket and render as before.
  const sectioned = groupFieldsBySection(schema.fields);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {showLowConfBanner && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
          <div className="font-medium mb-1">Source quality flagged</div>
          <p>
            This document was extracted from a low-quality source ({lowConfidenceFieldIds.length}
            {" "}of {totalFieldCount} fields below the confidence threshold). Please verify
            each value carefully as you fill.
          </p>
        </div>
      )}

      {sectioned.flat.map((field) => (
        <FieldControl
          key={field.id}
          field={field}
          name={field.id}
          register={register}
          errorMessage={(errors[field.id]?.message as string) ?? undefined}
          flaggedLowConfidence={effectiveLowConfSet.has(field.id)}
        />
      ))}

      {sectioned.bySection.map(({ section, fields }) => (
        <section key={section} className="pt-4 border-t border-neutral-200">
          <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">
            {section}
          </h2>
          <div className="space-y-6">
            {fields.map((field) => (
              <FieldControl
                key={field.id}
                field={field}
                name={field.id}
                register={register}
                errorMessage={(errors[field.id]?.message as string) ?? undefined}
                flaggedLowConfidence={effectiveLowConfSet.has(field.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {schema.fieldGroups.map((group) => (
        <FieldGroupSection
          key={group.id}
          group={group}
          register={register}
          errors={errors}
          lowConfSet={effectiveLowConfSet}
        />
      ))}

      {schema.signatureBlocks.length > 0 && (
        <SignatureSection blocks={schema.signatureBlocks} />
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-4 text-sm">
          <div className="font-medium mb-1">Could not submit</div>
          <pre className="whitespace-pre-wrap text-xs">{submitError}</pre>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <DraftSaveIndicator
          status={draftSave.status}
          lastSavedAt={draftSave.lastSavedAt}
          lastError={draftSave.lastError}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-neutral-900 text-white rounded-lg py-3 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 transition"
      >
        {isSubmitting ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}

function appendFieldValue(
  fd: FormData,
  field: AgreementField,
  name: string,
  values: FormValues,
) {
  const v = values[name];
  if (field.type === "file") {
    const input = document.getElementById(`file-${name}`) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (file) fd.append(`files:${name}`, file);
  } else if (field.type === "checkbox") {
    fd.append(name, v ? "true" : "false");
  } else if (v !== undefined && v !== null) {
    fd.append(name, String(v));
  }
}

function FieldGroupSection({
  group,
  register,
  errors,
  lowConfSet,
}: {
  group: FieldGroup;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  lowConfSet: Set<string>;
}) {
  return (
    <section className="pt-4 border-t border-neutral-200">
      <h3 className="text-sm font-medium text-neutral-700 uppercase tracking-wide mb-4">
        {group.label}
      </h3>
      <div className="space-y-8">
        {Array.from({ length: group.initialInstances }, (_, i) => (
          <div
            key={i}
            className="rounded-md border border-neutral-200 bg-white p-4 space-y-4"
          >
            <div className="text-xs text-neutral-500 font-medium">#{i + 1}</div>
            {group.template.map((field) => {
              const name = groupFieldName(group.id, i, field.id);
              return (
                <FieldControl
                  key={field.id}
                  field={field}
                  name={name}
                  register={register}
                  errorMessage={(errors[name]?.message as string) ?? undefined}
                  flaggedLowConfidence={lowConfSet.has(field.id)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function SignatureSection({ blocks }: { blocks: SignatureBlock[] }) {
  return (
    <div className="pt-4 border-t border-neutral-200 space-y-3">
      <h3 className="text-sm font-medium text-neutral-700 uppercase tracking-wide">
        Signatures
      </h3>
      {blocks.map((block) => (
        <div
          key={block.id}
          className="rounded-lg border border-neutral-200 bg-white p-4"
        >
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-medium text-sm text-neutral-800">{block.role}</div>
            <SignerRoleBadge signerRole={block.signerRole} />
          </div>
          {block.signerRole === "pre-signed" ? (
            <div className="text-sm text-neutral-500 italic">
              Already signed on the source document — no action required.
            </div>
          ) : block.signerRole === "counterparty" ? (
            <div className="text-sm text-neutral-500">
              This block is reserved for the counterparty; they will sign it
              after you submit.
            </div>
          ) : (
            <div className="border-2 border-dashed border-neutral-300 rounded-md p-6 text-center text-sm text-neutral-500 bg-neutral-50">
              Signature capture ships in Phase E — placeholder.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SignerRoleBadge({ signerRole }: { signerRole: SignatureBlock["signerRole"] }) {
  const styles: Record<SignatureBlock["signerRole"], string> = {
    self: "bg-emerald-100 text-emerald-900",
    "co-signer": "bg-sky-100 text-sky-900",
    counterparty: "bg-neutral-200 text-neutral-700",
    "pre-signed": "bg-amber-100 text-amber-900",
  };
  const labels: Record<SignatureBlock["signerRole"], string> = {
    self: "You",
    "co-signer": "Co-signer",
    counterparty: "Counterparty",
    "pre-signed": "Already signed",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[signerRole]}`}
    >
      {labels[signerRole]}
    </span>
  );
}

function buildDefaults(schema: AgreementSchema): FormValues {
  const out: FormValues = {};
  const seed = (name: string, type: AgreementField["type"]) => {
    out[name] = type === "checkbox" ? false : "";
  };
  for (const f of schema.fields) seed(f.id, f.type);
  for (const group of schema.fieldGroups) {
    for (let i = 0; i < group.initialInstances; i++) {
      for (const f of group.template) {
        seed(groupFieldName(group.id, i, f.id), f.type);
      }
    }
  }
  return out;
}

/**
 * Merge schema defaults with persisted draft values (if any). Draft values
 * override defaults; unrecognized keys from the draft are dropped so we
 * never render stale fields from an outdated schema.
 */
function mergeDefaults(
  schema: AgreementSchema,
  initialValues: Record<string, unknown> | undefined,
): FormValues {
  const defaults = buildDefaults(schema);
  if (!initialValues) return defaults;
  const merged: FormValues = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const raw = initialValues[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "boolean") merged[key] = raw;
    else if (typeof raw === "string") merged[key] = raw;
    else if (typeof raw === "number") merged[key] = String(raw);
    // File-type "object" shapes are not restored into the form — they're
    // only persisted on final submit.
  }
  return merged;
}

function DraftSaveIndicator({
  status,
  lastSavedAt,
  lastError,
}: {
  status: DraftSaveStatus;
  lastSavedAt: Date | null;
  lastError: string | null;
}) {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);

  if (status === "saving") {
    return <span className="text-xs text-neutral-500">Saving…</span>;
  }
  if (status === "saved" && lastSavedAt) {
    return <span className="text-xs text-neutral-500">Saved at {fmt(lastSavedAt)}</span>;
  }
  if (status === "error") {
    return (
      <span className="text-xs text-red-700" title={lastError ?? undefined}>
        Save failed — retrying on next edit
      </span>
    );
  }
  return null;
}

interface FieldControlProps {
  field: AgreementField;
  /** The form-field name; differs from field.id for fields inside a group instance. */
  name: string;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errorMessage: string | undefined;
  flaggedLowConfidence: boolean;
}

function FieldControl({ field, name, register, errorMessage, flaggedLowConfidence }: FieldControlProps) {
  const base =
    "w-full border border-neutral-300 rounded-md px-3 py-2 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-500";

  const label = (
    <label
      htmlFor={name}
      className="block text-sm font-medium text-neutral-800 mb-1.5"
    >
      {field.label}
      {field.required && <span className="text-red-600 ml-1">*</span>}
      {flaggedLowConfidence && (
        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-900">
          low confidence — verify
        </span>
      )}
    </label>
  );

  const helper = (
    <>
      {field.hint && !errorMessage && (
        <p className="mt-1 text-xs text-neutral-500">{field.hint}</p>
      )}
      {errorMessage && <p className="mt-1 text-xs text-red-700">{errorMessage}</p>}
    </>
  );

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          id={name}
          rows={4}
          placeholder={field.placeholder}
          {...register(name)}
          className={base}
        />
        {helper}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div>
        <label htmlFor={name} className="flex items-start gap-3 cursor-pointer">
          <input
            id={name}
            type="checkbox"
            {...register(name)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
          />
          <span className="text-sm text-neutral-800">
            {field.label}
            {field.required && <span className="text-red-600 ml-1">*</span>}
          </span>
        </label>
        {helper}
      </div>
    );
  }

  if ((field.type === "radio" || field.type === "select") && field.options?.length) {
    if (field.type === "select") {
      return (
        <div>
          {label}
          <select id={name} {...register(name)} className={base}>
            <option value="">Select…</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {helper}
        </div>
      );
    }
    return (
      <fieldset>
        <legend className="block text-sm font-medium text-neutral-800 mb-2">
          {field.label}
          {field.required && <span className="text-red-600 ml-1">*</span>}
        </legend>
        <div className="space-y-2">
          {field.options.map((opt) => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                value={opt}
                {...register(name)}
                className="h-4 w-4 border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
              />
              <span className="text-sm text-neutral-800">{opt}</span>
            </label>
          ))}
        </div>
        {helper}
      </fieldset>
    );
  }

  if (field.type === "signature" || field.type === "initials") {
    return (
      <div>
        {label}
        <div className="border-2 border-dashed border-neutral-300 rounded-lg p-6 text-center text-sm text-neutral-500 bg-neutral-50">
          Signature capture ships in Phase E — placeholder.
        </div>
        {helper}
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <div>
        {label}
        <input
          id={`file-${name}`}
          type="file"
          className="block w-full text-sm text-neutral-800 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-neutral-100 file:text-neutral-800 hover:file:bg-neutral-200"
        />
        {helper}
      </div>
    );
  }

  const inputType =
    field.type === "email"
      ? "email"
      : field.type === "phone"
        ? "tel"
        : field.type === "date"
          ? "date"
          : field.type === "number"
            ? "number"
            : "text";

  return (
    <div>
      {label}
      <input
        id={name}
        type={inputType}
        placeholder={field.placeholder}
        {...register(name)}
        className={base}
      />
      {helper}
    </div>
  );
}
