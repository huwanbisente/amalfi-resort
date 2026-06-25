import html2canvas from 'html2canvas';
import { format } from 'date-fns';

/**
 * Captures a DOM element to a PNG and triggers a download.
 * @param {React.RefObject} ref - ref attached to the element to capture
 * @param {string} label       - used in filename, e.g. 'Verifications'
 */
export async function exportToPng(ref, label = 'export') {
    const el = ref?.current;
    if (!el) return;
    // Build an off-screen clone so we never mutate the live DOM.
    const clone = el.cloneNode(true);

    // Strip entry animation so the clone renders fully visible.
    clone.style.animation = 'none';
    clone.style.opacity   = '1';
    clone.style.transform = 'none';

    // Build header banner
    const banner = document.createElement('div');
    banner.style.cssText = `
        font-family: 'Outfit', 'Inter', sans-serif;
        padding: 14px 24px 12px;
        background: #1c2520;
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-radius: 12px 12px 0 0;
    `;
    banner.innerHTML = `
        <div>
            <div style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;opacity:0.55;margin-bottom:3px">
                Amalfi Sanctuary Hub
            </div>
            <div style="font-size:16px;font-weight:800;letter-spacing:-0.5px">${label}</div>
        </div>
        <div style="text-align:right;font-size:10px;opacity:0.55;font-weight:700;line-height:1.5">
            Report generated<br/>${format(new Date(), 'MMM d, yyyy | h:mm a')}
        </div>
    `;

    // Outer wrapper matches the actual page background color exactly.
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        background: #fcfbf9;
        padding: 0 0 20px 0;
        border-radius: 12px;
        display: inline-block;
        width: ${el.offsetWidth}px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.12);
        position: absolute;
        top: -9999px;
        left: -9999px;
    `;

    wrapper.appendChild(banner);
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
        const canvas = await html2canvas(wrapper, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#fcfbf9',
            logging: false,
            // Ensure full element height is captured, not just viewport
            windowWidth:  wrapper.scrollWidth,
            windowHeight: wrapper.scrollHeight,
            scrollX: 0,
            scrollY: 0,
        });

        const link = document.createElement('a');
        link.download = `Sanctuary_${label.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } finally {
        document.body.removeChild(wrapper);
    }
}
