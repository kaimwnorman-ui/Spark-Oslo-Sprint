// Spark's game tab. M0: the title screen.
import { CHALLENGE_HOOK, PRODUCT_NAME } from '../../../shared/config.ts';

const app = document.getElementById('app')!;
app.innerHTML = `
  <section class="screen title" id="screen-title">
    <h1 class="logo">${PRODUCT_NAME}</h1>
    ${CHALLENGE_HOOK ? `<p class="tagline">${CHALLENGE_HOOK}</p>` : ''}
  </section>`;
