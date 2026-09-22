"use client";

import { useState } from "react";
import { namedMeshFilename } from "../../lib/design-file";
import { triggerDownload } from "../../lib/download";
import { GenerationCancelledError, type GenerationClient } from "../../lib/generation/client";
import { withCorrectionTag, type PrinterProfileV1 } from "../../lib/printer-profile";
import { fitTestCouponFilename } from "../../lib/products/shared";
import type { AnyProduct } from "../../lib/products/types";
import { serializeCheckedBinaryStl } from "../../lib/stl";
import { checkedModelGeometry } from "../../lib/three-geometry";
import type { PreviewModel } from "./useProductGeneration";

interface StlExportOptions {
  product: AnyProduct;
  preview: PreviewModel | null;
  disabled: boolean;
  designName: string;
  activeProfile: PrinterProfileV1;
  generate: GenerationClient["generate"];
  onModelError: (message: string) => void;
  onFileError: (message: string) => void;
}

export function useStlExport({
  product, preview, disabled, designName, activeProfile, generate, onModelError, onFileError,
}: StlExportOptions) {
  const [fitTestBusy, setFitTestBusy] = useState(false);

  const downloadStl = () => {
    if (disabled || !preview) return;
    try {
      const data = serializeCheckedBinaryStl(
        preview.geometry,
        preview.triangleCount,
        "The STL safety check did not match the visible preview.",
      );
      triggerDownload(
        new Blob([data], { type: "model/stl" }),
        withCorrectionTag(
          namedMeshFilename(designName, product.filename(preview.parameters)),
          activeProfile,
          product.compensable,
        ),
      );
    } catch (error) {
      onModelError(error instanceof Error ? error.message : "STL export failed.");
    }
  };

  const downloadFitTest = async () => {
    if (disabled || !preview || !product.coupon || !product.couponBoundsContract || fitTestBusy) return;
    setFitTestBusy(true);
    try {
      // Use the same worker and compensation as the preview. An edit cancels
      // the in-flight coupon through the generation hook's shared client.
      const model = await generate(product.id, preview.compensatedParameters, "coupon");
      const { geometry, analysis } = checkedModelGeometry(
        model,
        product.couponBoundsContract(preview.compensatedParameters),
        "The fit-test coupon did not pass its safety check.",
      );
      try {
        const data = serializeCheckedBinaryStl(
          geometry,
          analysis.triangleCount,
          "The fit-test STL safety check did not match the generated coupon.",
        );
        triggerDownload(
          new Blob([data], { type: "model/stl" }),
          withCorrectionTag(
            namedMeshFilename(designName, fitTestCouponFilename(model, preview.signature)),
            activeProfile,
            product.compensable,
          ),
        );
      } finally {
        geometry.dispose();
      }
    } catch (error) {
      onFileError(
        error instanceof GenerationCancelledError
          ? "An edit cancelled the fit test. Wait for the preview, then try again."
          : error instanceof Error ? error.message : "Fit-test export failed.",
      );
    } finally {
      setFitTestBusy(false);
    }
  };

  return { downloadStl, downloadFitTest, fitTestBusy };
}
