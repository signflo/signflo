"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import type { AgreementField, AgreementSchema } from "@/lib/vision/types";

interface Props {
  agreementId: string;
  shortId: string;
  schema: AgreementSchema;
  lowConfidenceFieldIds?: string[];
}

type FormValues = Record<string, string | boolean>;

export function FormRenderer({ agreementId, shortId, schema, lowConfidenceFieldIds = [] }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    mode: "onBlur",
    defaultValues: buildDefaults(schema.fields),
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const lowConfSet = new Set(lowConfidenceFieldIds);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setSubmitError(null);

    const fd = new FormData();
    fd.append("agreementId", agreementId);

    for (const field of schema.fields) {
      const v = values[field.id];
      if (field.type === "file") {
        const fileInput = document.getElementById(`file-${field.id}`) as HTMLInputElement | null;
        const file = fileInput?.files?.[0];
        if (file) fd.append(`files:${field.id}`, file);
      } else if (field.type === "checkbox") {
        fd.append(field.id, v ? "true" : "false");
      } else if (v !== undefined && v !== null) {
        fd.append(field.id, String(v));
      }
    }

    const res = await fetch("/api/submissions", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setSubmitError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    const body = await res.json();
    window.location.href = `/a/${shortId}/complete?submission=${body.submissionShortId}`;
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {schema.fields.map((field) => (
        <FieldControl
          key={field.id}
          field={field}
          register={register}
          errorMessage={(errors[field.id]?.message as string) ?? undefined}
          flaggedLowConfidence={lowConfSet.has(field.id)}
        />
      ))}

      {schema.signatureBlocks.length > 0 && (
        <div className="pt-4 border-t border-neutral-200">
          <h3 className="text-sm font-medium text-neutral-700 uppercase tracking-wide mb-2">
            Signature
          </h3>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            Signature capture ships in Phase C. For now, fill the form and submit;
            the signed PDF will be produced in a later step.
          </div>
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-4 text-sm">
          <div className="font-medium mb-1">Could not submit</div>
          <pre className="whitespace-pre-wrap text-xs">{submitError}</pre>
        </div>
      )}

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

function buildDefaults(fields: AgreementField[]): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    if (f.type === "checkbox") out[f.id] = false;
    else out[f.id] = "";
  }
  return out;
}

interface FieldControlProps {
  field: AgreementField;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errorMessage: string | undefined;
  flaggedLowConfidence: boolean;
}

function FieldControl({ field, register, errorMessage, flaggedLowConfidence }: FieldControlProps) {
  const base =
    "w-full border border-neutral-300 rounded-md px-3 py-2 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-500";

  const label = (
    <label
      htmlFor={field.id}
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
          id={field.id}
          rows={4}
          placeholder={field.placeholder}
          {...register(field.id)}
          className={base}
        />
        {helper}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div>
        <label htmlFor={field.id} className="flex items-start gap-3 cursor-pointer">
          <input
            id={field.id}
            type="checkbox"
            {...register(field.id)}
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
          <select id={field.id} {...register(field.id)} className={base}>
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
                {...register(field.id)}
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
          Signature capture ships in Phase C — placeholder.
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
          id={`file-${field.id}`}
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
        id={field.id}
        type={inputType}
        placeholder={field.placeholder}
        {...register(field.id)}
        className={base}
      />
      {helper}
    </div>
  );
}
