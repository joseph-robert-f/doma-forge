"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { BufferGeometry } from "three";
import {
  createGenerationClient,
  GenerationCancelledError,
  type GenerationClient,
} from "../../lib/generation/client";
import type { AnyParameters, AnyProduct } from "../../lib/products/types";
import { checkedModelGeometry } from "../../lib/three-geometry";
import type { ViewerStatus } from "./ModelViewer";

const REGENERATION_DELAY_MS = 140;

export interface PreviewModel {
  /** The viewer owns committed geometry; abandoned candidates are disposed here. */
  geometry: BufferGeometry;
  parameters: AnyParameters;
  compensatedParameters: AnyParameters;
  signature: string;
  meshSignature: string;
  triangleCount: number;
}

interface ProductGenerationOptions {
  product: AnyProduct;
  targetParameters: AnyParameters;
  compensatedParameters: AnyParameters;
  meshSignature: string;
  enabled: boolean;
  canGenerate: boolean;
  onGenerated: (preview: PreviewModel) => void;
}

/** Owns the worker lifecycle and commits only the latest valid preview. */
export function useProductGeneration({
  product,
  targetParameters,
  compensatedParameters,
  meshSignature,
  enabled,
  canGenerate,
  onGenerated,
}: ProductGenerationOptions) {
  const [preview, setPreview] = useState<PreviewModel | null>(null);
  const [viewerStatus, setViewerStatus] = useState<ViewerStatus>("loading");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const clientRef = useRef<GenerationClient | null>(null);
  const generationId = useRef(0);

  const generate = useCallback<GenerationClient["generate"]>((...args) => {
    const client = (clientRef.current ??= createGenerationClient());
    return client.generate(...args);
  }, []);

  useEffect(() => () => {
    clientRef.current?.dispose();
    clientRef.current = null;
  }, []);

  const reportError = useCallback((message: string) => {
    setGenerationError(message);
    setViewerStatus("error");
  }, []);

  const markPending = useEffectEvent(() => {
    setViewerStatus(preview ? "updating" : "loading");
    setGenerationError(null);
  });

  const markPaused = useEffectEvent(() => {
    setViewerStatus("paused");
    setGenerationError(null);
  });

  const notifyGenerated = useEffectEvent(onGenerated);
  const runGeneration = useEffectEvent(async (requestId: number) => {
    // Capture the request before awaiting; a newer edit may arrive meanwhile.
    const request = { product, targetParameters, compensatedParameters, meshSignature };
    try {
      const model = await generate(request.product.id, request.compensatedParameters);
      // Avoid converting a result that arrived after cancellation or unmount.
      if (requestId !== generationId.current) return;
      const signature = request.product.signature(request.targetParameters);
      const { geometry, analysis } = checkedModelGeometry(
        model,
        request.product.boundsContract(request.compensatedParameters),
        "The generated mesh did not pass its safety check.",
      );
      const nextPreview: PreviewModel = {
        geometry,
        parameters: request.targetParameters,
        compensatedParameters: request.compensatedParameters,
        signature,
        meshSignature: request.meshSignature,
        triangleCount: analysis.triangleCount,
      };
      setPreview(nextPreview);
      setViewerStatus("ready");
      notifyGenerated(nextPreview);
    } catch (error) {
      if (requestId !== generationId.current || error instanceof GenerationCancelledError) return;
      reportError(error instanceof Error ? error.message : "Preview generation failed.");
    }
  });

  useEffect(() => {
    if (!enabled) return;
    const requestId = ++generationId.current;
    const statusTimer = window.setTimeout(() => {
      if (requestId !== generationId.current) return;
      if (canGenerate) markPending();
      else markPaused();
    }, 0);
    const timer = canGenerate
      ? window.setTimeout(() => { void runGeneration(requestId); }, REGENERATION_DELAY_MS)
      : undefined;

    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(timer);
      if (generationId.current === requestId) generationId.current += 1;
      clientRef.current?.cancel();
    };
    // Effect events read current parameters/callbacks without rebuilding for
    // printer names, nozzle edits, or other changes that leave the mesh intact.
  }, [product, meshSignature, enabled, canGenerate]);

  return { preview, viewerStatus, generationError, generate, reportError };
}
