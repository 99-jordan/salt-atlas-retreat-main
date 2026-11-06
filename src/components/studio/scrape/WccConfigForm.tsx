import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_WCC_INPUT,
  globsFromText,
  globsToText,
  type WccCrawlerType,
  type WccHtmlTransformer,
  type WccInput,
} from "@/lib/wcc-types";
import { useState } from "react";

export function urlsToText(urls: { url: string }[]): string {
  return urls.map((u) => u.url).join("\n");
}

type Props = {
  value: Omit<WccInput, "startUrls">;
  onChange: (next: Omit<WccInput, "startUrls">) => void;
  startUrlsText: string;
  onStartUrlsChange: (text: string) => void;
  disabled?: boolean;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export function WccConfigForm({
  value,
  onChange,
  startUrlsText,
  onStartUrlsChange,
  disabled,
}: Props) {
  const [advanced, setAdvanced] = useState(false);
  const patch = (partial: Partial<Omit<WccInput, "startUrls">>) =>
    onChange({ ...value, ...partial });

  return (
    <div className="space-y-6">
      <Field
        label="Start URLs"
        hint="One URL per line. The crawler starts here and follows links (same as Apify console)."
      >
        <Textarea
          value={startUrlsText}
          onChange={(e) => onStartUrlsChange(e.target.value)}
          disabled={disabled}
          rows={7}
          placeholder={"https://example-resort.com\nhttps://competitor.com/morocco/resort-name"}
          className="font-mono text-[12px]"
        />
      </Field>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Crawl</h3>
        <Field label="Crawler type" hint="Adaptive is recommended. Cheerio is cheapest/fastest for static sites.">
          <Select
            value={value.crawlerType}
            onValueChange={(v) => patch({ crawlerType: v as WccCrawlerType })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="playwright:adaptive">Adaptive (browser + HTTP)</SelectItem>
              <SelectItem value="playwright:firefox">Headless browser (Firefox)</SelectItem>
              <SelectItem value="cheerio">Raw HTTP (Cheerio)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Max crawl depth">
            <Input
              type="number"
              min={0}
              max={100}
              value={value.maxCrawlDepth}
              disabled={disabled}
              onChange={(e) => patch({ maxCrawlDepth: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Max crawl pages">
            <Input
              type="number"
              min={1}
              value={value.maxCrawlPages}
              disabled={disabled}
              onChange={(e) => patch({ maxCrawlPages: Number(e.target.value) || 1 })}
            />
          </Field>
          <Field label="Max results stored">
            <Input
              type="number"
              min={1}
              value={value.maxResults}
              disabled={disabled}
              onChange={(e) => patch({ maxResults: Number(e.target.value) || 1 })}
            />
          </Field>
          <Field label="Max concurrency">
            <Input
              type="number"
              min={1}
              max={200}
              value={value.maxConcurrency}
              disabled={disabled}
              onChange={(e) => patch({ maxConcurrency: Number(e.target.value) || 1 })}
            />
          </Field>
        </div>
        <Toggle
          label="Use Apify Proxy"
          hint="Required for many sites; enabled by default."
          checked={value.proxyConfiguration.useApifyProxy}
          disabled={disabled}
          onCheckedChange={(v) => patch({ proxyConfiguration: { useApifyProxy: v } })}
        />
        <Toggle
          label="Respect robots.txt"
          checked={value.respectRobotsTxtFile}
          disabled={disabled}
          onCheckedChange={(v) => patch({ respectRobotsTxtFile: v })}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Scope</h3>
        <Field label="Include URL globs" hint="One glob per line — extends crawl beyond start URL subpaths.">
          <Textarea
            value={globsToText(value.includeUrlGlobs)}
            disabled={disabled}
            rows={3}
            className="font-mono text-[12px]"
            placeholder="https://www.example.com/blog/**"
            onChange={(e) => patch({ includeUrlGlobs: globsFromText(e.target.value) })}
          />
        </Field>
        <Field label="Exclude URL globs">
          <Textarea
            value={globsToText(value.excludeUrlGlobs)}
            disabled={disabled}
            rows={3}
            className="font-mono text-[12px]"
            placeholder="https://www.example.com/login/**"
            onChange={(e) => patch({ excludeUrlGlobs: globsFromText(e.target.value) })}
          />
        </Field>
        <Toggle
          label="Use sitemaps"
          checked={value.useSitemaps}
          disabled={disabled}
          onCheckedChange={(v) => patch({ useSitemaps: v })}
        />
        <Toggle
          label="Use llms.txt"
          checked={value.useLlmsTxt}
          disabled={disabled}
          onCheckedChange={(v) => patch({ useLlmsTxt: v })}
        />
        <Field
          label="Only crawl pages modified since"
          hint="YYYY-MM-DD or ISO datetime. Leave empty for a full crawl."
        >
          <Input
            value={value.onlyCrawlPagesModifiedSince}
            disabled={disabled}
            placeholder="2026-01-01"
            onChange={(e) => patch({ onlyCrawlPagesModifiedSince: e.target.value })}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">HTML & output</h3>
        <Field label="HTML transformer">
          <Select
            value={value.htmlTransformer}
            disabled={disabled}
            onValueChange={(v) => patch({ htmlTransformer: v as WccHtmlTransformer })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="readableText">Readable text</SelectItem>
              <SelectItem value="readableTextIfPossible">Readable text with fallback</SelectItem>
              <SelectItem value="extractus">Extractus</SelectItem>
              <SelectItem value="defuddle">Defuddle</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Toggle
          label="Save Markdown"
          hint="Stores markdown on each dataset page (recommended)."
          checked={value.saveMarkdown}
          disabled={disabled}
          onCheckedChange={(v) => patch({ saveMarkdown: v })}
        />
        <Toggle
          label="Remove cookie warnings"
          checked={value.removeCookieWarnings}
          disabled={disabled}
          onCheckedChange={(v) => patch({ removeCookieWarnings: v })}
        />
      </section>

      <button
        type="button"
        className="text-xs font-medium text-primary hover:underline"
        onClick={() => setAdvanced((a) => !a)}
      >
        {advanced ? "Hide advanced" : "Show advanced"}
      </button>

      {advanced ? (
        <section className="space-y-3 rounded-xl border border-dashed p-4">
          <h3 className="text-sm font-semibold">Advanced</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Initial concurrency">
              <Input
                type="number"
                min={0}
                value={value.initialConcurrency}
                disabled={disabled}
                onChange={(e) => patch({ initialConcurrency: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Max request retries">
              <Input
                type="number"
                min={0}
                value={value.maxRequestRetries}
                disabled={disabled}
                onChange={(e) => patch({ maxRequestRetries: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Request timeout (s)">
              <Input
                type="number"
                min={1}
                value={value.requestTimeoutSecs}
                disabled={disabled}
                onChange={(e) => patch({ requestTimeoutSecs: Number(e.target.value) || 60 })}
              />
            </Field>
            <Field label="Dynamic content wait (s)">
              <Input
                type="number"
                min={0}
                value={value.dynamicContentWaitSecs}
                disabled={disabled}
                onChange={(e) => patch({ dynamicContentWaitSecs: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Max scroll height (px)">
              <Input
                type="number"
                min={0}
                value={value.maxScrollHeightPixels}
                disabled={disabled}
                onChange={(e) => patch({ maxScrollHeightPixels: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Readable text char threshold">
              <Input
                type="number"
                min={0}
                value={value.readableTextCharThreshold}
                disabled={disabled}
                onChange={(e) =>
                  patch({ readableTextCharThreshold: Number(e.target.value) || 0 })
                }
              />
            </Field>
          </div>
          <Field label="Wait for selector">
            <Input
              value={value.waitForSelector}
              disabled={disabled}
              className="font-mono text-[12px]"
              onChange={(e) => patch({ waitForSelector: e.target.value })}
            />
          </Field>
          <Field label="Soft wait for selector">
            <Input
              value={value.softWaitForSelector}
              disabled={disabled}
              className="font-mono text-[12px]"
              onChange={(e) => patch({ softWaitForSelector: e.target.value })}
            />
          </Field>
          <Field label="Click elements (CSS)">
            <Input
              value={value.clickElementsCssSelector}
              disabled={disabled}
              className="font-mono text-[12px]"
              onChange={(e) => patch({ clickElementsCssSelector: e.target.value })}
            />
          </Field>
          <Field label="Keep elements (CSS)">
            <Input
              value={value.keepElementsCssSelector}
              disabled={disabled}
              className="font-mono text-[12px]"
              onChange={(e) => patch({ keepElementsCssSelector: e.target.value })}
            />
          </Field>
          <Field label="Remove elements (CSS)">
            <Textarea
              value={value.removeElementsCssSelector}
              disabled={disabled}
              rows={3}
              className="font-mono text-[12px]"
              onChange={(e) => patch({ removeElementsCssSelector: e.target.value })}
            />
          </Field>
          <Toggle
            label="Keep URL fragments"
            checked={value.keepUrlFragments}
            disabled={disabled}
            onCheckedChange={(v) => patch({ keepUrlFragments: v })}
          />
          <Toggle
            label="Ignore canonical URL"
            checked={value.ignoreCanonicalUrl}
            disabled={disabled}
            onCheckedChange={(v) => patch({ ignoreCanonicalUrl: v })}
          />
          <Toggle
            label="Block media"
            checked={value.blockMedia}
            disabled={disabled}
            onCheckedChange={(v) => patch({ blockMedia: v })}
          />
          <Toggle
            label="Expand iframes"
            checked={value.expandIframes}
            disabled={disabled}
            onCheckedChange={(v) => patch({ expandIframes: v })}
          />
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            disabled={disabled}
            onClick={() => onChange({ ...DEFAULT_WCC_INPUT })}
          >
            Reset options to defaults
          </button>
        </section>
      ) : null}
    </div>
  );
}
