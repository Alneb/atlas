<script lang="ts">
  // The app's icon by any name a source gives (the plugin API's icons are strings): an unknown one is the library's.
  import AppIcon from "../../../../../ui/src/components/Icon.svelte";
  import { isIconName } from "../../../../../ui/src/lib/icons";

  let { name, size = 16 }: { name: string; size?: number } = $props();
</script>

<AppIcon name={isIconName(name) ? name : "library"} {size} />
