import { highlight } from "fumadocs-core/highlight";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";

import { shikiHighlightOptions } from "@/lib/shiki-themes";

const managers = ["pnpm", "bun", "npm"] as const;

function installCommand(pkg: string, manager: string) {
  if (manager === "npm") return `npm install ${pkg}`;
  return `${manager} add ${pkg}`;
}

function runCommand(command: string, manager: string) {
  if (manager === "pnpm") return `pnpm dlx ${command}`;
  if (manager === "bun") return `bunx ${command}`;
  return `npx ${command}`;
}

async function HighlightedCode({ code }: { code: string }) {
  return highlight(code, {
    lang: "bash",
    ...shikiHighlightOptions,
    components: {
      pre: (props) => (
        <CodeBlock {...props}>
          <Pre>{props.children}</Pre>
        </CodeBlock>
      ),
    },
  });
}

export async function PackageInstall({ package: pkg }: { package: string }) {
  return (
    <Tabs items={[...managers]}>
      {managers.map((m) => (
        <Tab key={m} value={m}>
          <HighlightedCode code={installCommand(pkg, m)} />
        </Tab>
      ))}
    </Tabs>
  );
}

export async function PackageRun({ command }: { command: string }) {
  return (
    <Tabs items={[...managers]}>
      {managers.map((m) => (
        <Tab key={m} value={m}>
          <HighlightedCode code={runCommand(command, m)} />
        </Tab>
      ))}
    </Tabs>
  );
}
