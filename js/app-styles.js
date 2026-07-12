// Loaded after the branded shell has painted so the full component bundle
// cannot delay the first visible response. Vite extracts this import into the
// production stylesheet and resolves the module only after that CSS is ready.
import '../css/style.css';

export default true;
