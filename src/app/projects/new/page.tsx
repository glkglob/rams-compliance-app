"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProjectSchema,
  type CreateProjectInput,
} from "@/lib/validations/project.schema";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      complianceThreshold: 80,
    },
  });

  async function onSubmit(data: CreateProjectInput) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string | unknown[] };
        setError(
          Array.isArray(errorData.error)
            ? "Please fix the validation errors and try again."
            : errorData.error ?? "Failed to create project"
        );
        return;
      }

      const project = (await response.json()) as { id: string };
      router.push(`/projects/${project.id}`);
    } catch (requestError) {
      console.error("Error creating project:", requestError);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Button className="mb-6" variant="ghost" onClick={() => router.back()}>
        ← Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                {...register("name")}
                className={errors.name ? "border-destructive" : undefined}
                placeholder="Enter project name"
              />
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name</Label>
              <Input
                id="client-name"
                {...register("clientName")}
                placeholder="Enter client name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="site-address">Site Address</Label>
              <Input
                id="site-address"
                {...register("siteAddress")}
                placeholder="Enter site address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Enter project description"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compliance-threshold">Compliance Threshold (%)</Label>
              <Input
                id="compliance-threshold"
                type="number"
                {...register("complianceThreshold", { valueAsNumber: true })}
                className={errors.complianceThreshold ? "border-destructive" : undefined}
                min={0}
                max={100}
              />
              {errors.complianceThreshold ? (
                <p className="text-sm text-destructive">
                  {errors.complianceThreshold.message}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                RAMS must score above this threshold to be auto-approved. Default
                is 80%.
              </p>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
