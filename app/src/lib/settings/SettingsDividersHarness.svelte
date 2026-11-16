<script lang="ts">
  import { pagesListLook } from "./pages-list-look.ts";

  const SCOPE = ["flex flex-col", pagesListLook("android").page];
</script>

<div class={SCOPE}>
  <p>Choose how books open.</p>
  <section data-settings-group data-testid="first-group">
    <h2>Text</h2>
    <ul data-settings-group data-testid="first-inner-list">
      <li>Text size</li>
    </ul>
    <ul data-settings-group data-testid="second-inner-list">
      <li>Bold text</li>
    </ul>
  </section>
  <ul data-settings-group data-testid="second-group">
    <li>Reduce motion</li>
  </ul>
  <div data-settings-end class="p-lg" data-testid="padded-block">
    2.1 GB used
  </div>
  <ul data-settings-group data-testid="group-after-padded-block">
    <li>Clear cache</li>
  </ul>
  <p data-settings-end data-testid="footer">Cached pages come back.</p>
  <div>
    <div data-settings-group data-testid="wrapped-group">
      <h2>Navigation</h2>
    </div>
  </div>
</div>

<div class={SCOPE}>
  <div>Screenshot mode</div>
  <ul data-settings-group data-testid="group-after-switch">
    <li>Hide covers</li>
  </ul>
</div>

<div class={SCOPE}>
  <div>
    <ul data-settings-group>
      <li>App lock</li>
    </ul>
  </div>
  <section data-settings-group data-testid="group-after-block-holding-group">
    <h2>Crash reports</h2>
  </section>
</div>
