import ts from 'typescript';

/**
 * Formal interface checks run over every screen and component:
 * - every Pressable announces what it is (accessibilityRole);
 * - every TextInput has an accessible name;
 * - accessible names are translated, never hard-coded English;
 * - destructive confirmations use the app's Sheet, not a native Alert;
 * - a pressable ListRow never shows a trailing icon or text that ignores taps.
 */

// Node's fs is available under Jest; the app's tsconfig has no Node types, so it is typed here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readdirSync, readFileSync, statSync } = require('fs') as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
};
declare const __dirname: string;
const ROOT = `${__dirname}/../../../..`;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

type Finding = string;

function inspect(path: string): Finding[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const where = (node: ts.Node) => `${path.slice(ROOT.length + 1)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const attributes = node.attributes.properties;
      const spread = attributes.some(ts.isJsxSpreadAttribute);
      const attribute = (name: string) => attributes.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(source) === name);
      if (tag === 'Pressable' && !spread && !attribute('accessibilityRole')) {
        // The Sheet's inner surface only stops taps from closing it; it is not a control.
        const onPress = attribute('onPress')?.initializer?.getText(source);
        if (onPress !== '{() => undefined}') findings.push(`${where(node)} Pressable without accessibilityRole`);
      }
      if (tag === 'TextInput' && !spread && !attribute('accessibilityLabel')) {
        findings.push(`${where(node)} TextInput without accessibilityLabel`);
      }
      // ListRow renders `trailing` beside its touch area: a bare icon there looks tappable but is not.
      const trailing = attribute('trailing')?.initializer;
      if (tag === 'ListRow' && attribute('onPress') && trailing && ts.isJsxExpression(trailing) && trailing.expression) {
        let root: ts.Expression = trailing.expression;
        while (ts.isParenthesizedExpression(root)) root = root.expression;
        if ((ts.isJsxSelfClosingElement(root) || ts.isJsxElement(root)) && ['Icon', 'Text'].includes((ts.isJsxElement(root) ? root.openingElement : root).tagName.getText(source))) {
          findings.push(`${where(node)} pressable ListRow has a trailing element that looks tappable but is not`);
        }
      }
      const label = attribute('accessibilityLabel')?.initializer;
      if (label && (ts.isStringLiteral(label) || (ts.isJsxExpression(label) && label.expression && (ts.isNoSubstitutionTemplateLiteral(label.expression) || ts.isTemplateExpression(label.expression)) && /[A-Za-z]{3,}/.test(label.expression.getText(source).replace(/\$\{[^}]*\}/g, ''))))) {
        findings.push(`${where(node)} accessibilityLabel is not translated`);
      }
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'Alert.alert' && node.arguments.length >= 3) {
      findings.push(`${where(node)} confirmation uses Alert.alert instead of Sheet`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

describe('interface standards', () => {
  const files = [...tsxFiles(`${ROOT}/app`), ...tsxFiles(`${ROOT}/src`)];

  it('checks every screen and component', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('meets the accessibility and consistency rules', () => {
    expect(files.flatMap(inspect)).toEqual([]);
  });

  it('keeps content clear of the status and navigation bars', () => {
    const findings = files.flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      const name = path.slice(ROOT.length + 1);
      const problems: string[] = [];
      // A translucent modal draws under the system bars, so its file must read the safe-area insets.
      if (/statusBarTranslucent/.test(text) && !/useSafeAreaInsets|useAppInsets/.test(text)) problems.push(`${name} translucent Modal without safe-area insets`);
      // Anything pinned to the bottom edge must lift itself above the navigation bar.
      // (Overlays stretched top to bottom inside an image are not pinned to the screen edge.)
      const pinned = [...text.matchAll(/\{[^{}]*position:\s*['"]absolute['"][^{}]*\}/g)]
        .some(([style]) => /\bbottom:\s*0\b/.test(style) && !/\btop:/.test(style));
      if (pinned && !/insets\.bottom/.test(text)) problems.push(`${name} pinned to the bottom without insets.bottom`);
      return problems;
    });
    expect(findings).toEqual([]);
  });
});
