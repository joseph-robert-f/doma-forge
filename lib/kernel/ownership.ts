/** A Manifold or CrossSection handle with an explicit lifetime. */
interface KernelResource {
  delete(): void;
}

/**
 * Local ownership only: register each allocation immediately, transfer it
 * with `take` before a consuming call or return, and dispose in `finally`.
 * Borrowed handles must never be registered. Identity deduplication keeps
 * aliases (including union-of-one results) from being deleted twice.
 */
export class ResourceScope {
  private readonly resources = new Set<KernelResource>();

  own<T extends KernelResource | null>(resource: T): T {
    if (resource !== null) this.resources.add(resource);
    return resource;
  }

  take<T extends KernelResource>(resource: T): T {
    this.resources.delete(resource);
    return resource;
  }

  takeAll<T extends KernelResource>(resources: T[]): T[] {
    for (const resource of resources) this.take(resource);
    return resources;
  }

  /** Release early, removing ownership before invoking the destructor. */
  delete(resource: KernelResource): void {
    if (this.resources.delete(resource)) resource.delete();
  }

  dispose(): void {
    let failed = false;
    let firstError: unknown;
    // Release dependents first, and still attempt every release if one fails.
    for (const resource of [...this.resources].reverse()) {
      try {
        this.delete(resource);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (failed) throw firstError;
  }
}
