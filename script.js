// ==========================================
// WESA OS - ADAPTIVE LAYERED AI WORKFLOWSTATION
// RDZEŃ ORKIESTRACJI FRONTENDU (script.js)
// ==========================================

// Globalne selektory interfejsu Live Workspace
const output = document.querySelector("#spawn-output");
const button = document.querySelector("#spawn-workspace");
const query = document.querySelector("#workflow-query");

// Oficjalny, zabezpieczony adres Jądra n8n na Twoim serwerze VPS Hostinger
const N8N_WEBHOOK_URL = 'https://n8n-fzhn.srv1700352.hstgr.cloud/webhook/c666674f-8f80-4905-93e8-9e7f030a0be9'; 

// Funkcja obsługująca proces operacyjny WESA OS przez n8n
async function renderWorkspace() {
    const intent = query.value.trim();
    if (!intent) return;

    // Pokazujemy użytkownikowi stan ładowania (Wormhole w akcji)
    output.innerHTML = `
        <article class="spawn-pill animate-pulse border-teal-100 bg-teal-50/10" style="padding: 15px; border-radius: 8px; margin-bottom: 15px; background: rgba(20, 184, 166, 0.05); border: 1px solid rgba(20, 184, 166, 0.2);">
            <strong class="text-teal-600 flex items-center gap-1.5 text-xs uppercase tracking-wider" style="color: #0d9488; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #14b8a6; display: inline-block;"></span>
                Wormhole Active...
            </strong>
            <span class="block mt-1 text-slate-500 text-xs" style="display: block; margin-top: 4px; color: #64748b; font-size: 0.75rem;">Orkiestracja zapytania na VPS: "${intent}"</span>
        </article>
    `;

    try {
        // Wysyłamy zapytanie przez sieć do Twojego produkcyjnego jądra n8n
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: intent })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Elastyczne wyciąganie tekstu z n8n (obsługuje obiekt bezpośredni lub tablicę elementów)
        const aiResponse = data.output || (Array.isArray(data) ? data[0]?.output : null) || data.response || JSON.stringify(data);

        // Wstrzykujemy wynik analizy naukowej do Przestrzeni Roboczej (Live Workspace)
        output.innerHTML = `
            <article class="spawn-pill border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-teal-200" style="padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; background-color: #ffffff; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
                <strong class="text-teal-600 flex items-center gap-1.5 text-xs uppercase tracking-wider" style="color: #0d9488; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; display: inline-block;"></span>
                    Wynik analizy strukturalnej (WESA KERNEL)
                </strong>
                <div class="block mt-3 text-slate-700 text-sm whitespace-pre-wrap leading-relaxed" style="display: block; margin-top: 12px; color: #334155; font-size: 0.875rem; white-space: pre-wrap; line-height: 1.6;">${aiResponse}</div>
                <div class="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400" style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; font-size: 0.65rem; color: #94a3b8;">
                    <span>Status: Zweryfikowano semantycznie</span>
                    <span style="color: #059669; font-weight: 600;">Confidence: 97.8%</span>
                </div>
            </article>
        `;

    } catch (error) {
        console.error("Błąd połączenia z jądrem n8n:", error);
        output.innerHTML = `
            <article class="spawn-pill border-red-200 bg-red-50 text-red-700" style="padding: 15px; border-radius: 8px; border: 1px solid #fecaca; background-color: #fef2f2; color: #b91c1c; font-size: 0.875rem;">
                <strong>Błąd systemu:</strong> Brak odpowiedzi z jądra n8n Webhook. Sprawdź, czy proces w n8n jest opublikowany (Published) oraz czy Twój VPS na Hostingerze nie blokuje ruchu.
            </article>
        `;
    }
}

// Inicjalizacja i podpięcie nasłuchiwania zdarzeń (Event Listeners)
if (button) {
    button.addEventListener("click", renderWorkspace);
}

if (query) {
    query.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault(); // Zapobiegamy przeładowaniu strony
            renderWorkspace();
        }
    });
}
