function safeJSONParse(str) {
    try { return JSON.parse(str); } catch {}
    const start = str.indexOf("{");
    const end = str.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(str.slice(start, end + 1)); } catch {}
    return null;
}

function parseQuizArray(str) {
    try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed;
    } catch {}
    const start = str.indexOf("[");
    const end = str.lastIndexOf("]");
    if (start !== -1 && end !== -1) {
        try {
            const parsed = JSON.parse(str.slice(start, end + 1));
            if (Array.isArray(parsed)) return parsed;
        } catch {}
    }
    return null;
}

function getContext() {
    const activeSub = subjects[activeSubject];
    if (!activeSub) return null;
    const selectedFiles = activeSub.files.filter(f => f.selected);
    const workspace = document.getElementById("sourceDisplay")?.innerText || "";
    const recentChat = activeSub.chatHistory.slice(-5).map(h => h.text).join("\n");
    return { activeSub, selectedFiles, workspace, recentChat };
}

async function callAPI(prompt, model = "Lumen V", file = null) {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("model", model);
    if (file) {
        try {
            const blob = await (await fetch(file.data)).blob();
            form.append("file", blob, file.name);
        } catch (e) {
            console.warn(e);
        }
    }
    const res = await fetch(API_URL, { method: "POST", body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.response) throw new Error("No AI response");
    return data.response;
}

async function commenceTakeover(repeat, redo, takeover, time = 0, asked = new Set(), wrong = 0, questionCache = null) {
    const ctx = getContext();
    if (!ctx) return;
    const { selectedFiles, workspace, recentChat } = ctx;
    if (time === 0 && !redo) {
        document.body.innerHTML = '<div class="takeover-text">Please wait while Lumen prepares...</div>';
    } else {
        document.body.innerHTML = "<div class='takeover-text'>Loading next question...</div>";
    }
    if (!questionCache) {
        const excludeList = Array.from(asked).join(", ") || "none";
        const prompt = `[CRITICAL: RETURN ONLY JSON]\nGenerate 3 unique questions not in:\n${excludeList}\n\nFormat:\n[\n  {\n    "question": "string",\n    "options": {"a":"string","b":"string","c":"string","d":"string"},\n    "correct": "a",\n    "explanation": "string"\n  },\n  { ... },\n  { ... }\n]\n\nContext:\n${workspace}\n${recentChat}`.trim();

        try {
            const raw = await callAPI(prompt, selectedFiles.length ? "Lumen VI" : "Lumen V", selectedFiles[0] ?? null);
            questionCache = parseQuizArray(raw);
            if (!questionCache || questionCache.length < 3) {
                return commenceTakeover(repeat, redo, takeover, time, asked, wrong, null);
            }
        } catch (err) {
            await Swal.fire("Error", "Retrying questions...", "error");
            return commenceTakeover(repeat, redo, takeover, time, asked, wrong, null);
        }
    }

    const quiz = questionCache[time];
    if (!quiz || !quiz.question || !quiz.options) {
        return commenceTakeover(repeat, redo, takeover, time + 1, asked, wrong, questionCache);
    }
    document.body.innerHTML = "";
    asked.add(quiz.question);

    const result = await Swal.fire({
        title: quiz.question,
        input: "radio",
        inputOptions: quiz.options,
        inputValidator: v => !v && "Pick one",
        confirmButtonText: "Submit",
        allowOutsideClick: false,
        customClass: "swal-wide"
    });

    if (result.isConfirmed) {
        const correct = result.value === quiz.correct;
        if (!correct) wrong++;
        await Swal.fire({
            title: correct ? "Correct!" : "Incorrect",
            text: correct ? quiz.explanation : `Correct: ${quiz.correct.toUpperCase()} — ${quiz.options[quiz.correct]}. ${quiz.explanation}`,
            icon: correct ? "success" : "error"
        });
    }

    const nextTime = time + 1;
    if (takeover && nextTime < 3) {
        return commenceTakeover(repeat, false, takeover, nextTime, asked, wrong, questionCache);
    }
    if (takeover) {
        takeoverPartTwo(repeat, wrong, asked);
    }
}

async function takeoverPartTwo(repeat, wrong, asked = new Set()) {
    if (wrong === 0) {
        return takeoverPartThree(repeat, true, asked);
    }
    const questions = Array.from(asked);
    const prompt = `The user has completed a quiz.\nQuestions asked:\n${questions.length ? questions.map((q, i) => `${i + 1}. ${q}`).join("\n") : "No questions recorded."}\nThey got ${wrong} wrong.\nGive a concise but insightful performance analysis.\n- Identify weak areas\n- Explain WHY those areas matter\n- Suggest what to focus on next\n- Only 2 sentences with no dot points\n- End with a short actionable suggestion`.trim();

    try {
        const reply = await callAPI(prompt);
        if (typeof stopLoading === "function") stopLoading();
        const result = await Swal.fire({
            title: "Performance Analysis",
            html: marked.parse(reply),
            confirmButtonText: "Practice Weak Areas",
            className: "swal-wide"
        });
        if (result.isConfirmed) {
            commenceTakeover(true, true, true, 0, new Set(), 0, null);
        } else {
            takeoverPartThree(false, false, asked);
        }
    } catch (err) {
        Swal.fire({ icon: "error", title: "Something broke", text: err.message });
    }
}

async function takeoverPartThree(repeat, skipped, asked) {
    const partNum = skipped ? "2" : "3";
    const { isConfirmed } = await Swal.fire({
        title: `Takeover Part ${partNum}`,
        confirmButtonText: "Let's Go!",
        allowOutsideClick: false
    });
    if (!isConfirmed) return;

    const prompt = `Teach a new concept based on: ${Array.from(asked).join(", ")}`;
    try {
        const response = await callAPI(prompt, "Lumen V");
        const { isConfirmed: startPractice } = await Swal.fire({
            title: "New topic",
            html: marked.parse(response),
            confirmButtonText: "Practice",
            className: "swal-wide"
        });
        if (startPractice) {
            takeoverPartFour(repeat, skipped, response);
        }
    } catch (err) {
        console.error(err);
    }
}

async function takeoverPartFour(repeat, skipped, topic, time = 0, questionCache = null) {
    if (!questionCache) {
        const prompt = `[CRITICAL: RETURN ONLY JSON]\nCreate 3 unique multiple choice questions about: ${topic}\n\nFormat:\n[\n  {\n    "question": "string",\n    "options": {"a":"string","b":"string","c":"string","d":"string"},\n    "correct": "a",\n    "explanation": "string"\n  },\n  { ... },\n  { ... }\n]`.trim();
        try {
            const raw = await callAPI(prompt, "Lumen V");
            questionCache = parseQuizArray(raw);
            if (!questionCache || questionCache.length < 3) {
                throw new Error("Invalid batch");
            }
        } catch (err) {
            if (time < 3) return takeoverPartFour(repeat, skipped, topic, time + 1, null);
            return takeoverPartFive(repeat, skipped, topic);
        }
    }

    const quiz = questionCache[time];
    if (!quiz || !quiz.question || !quiz.options) {
        if (time < 2) return takeoverPartFour(repeat, skipped, topic, time + 1, questionCache);
        return takeoverPartFive(repeat, skipped, topic);
    }

    const result = await Swal.fire({
        title: quiz.question,
        input: "radio",
        inputOptions: quiz.options,
        inputValidator: v => !v && "Pick one",
        confirmButtonText: "Submit",
        allowOutsideClick: false,
        customClass: "swal-wide"
    });

    if (result.isConfirmed) {
        const isCorrect = result.value === quiz.correct;
        await Swal.fire({
            title: isCorrect ? "Correct!" : "Incorrect",
            text: isCorrect ? (quiz.explanation || "Nice work!") : `Correct: ${(quiz.correct || "").toUpperCase()} — ${quiz.options[quiz.correct]}. ${quiz.explanation || ""}`,
            icon: isCorrect ? "success" : "error"
        });

        if (time < 2) {
            return takeoverPartFour(repeat, skipped, topic, time + 1, questionCache);
        }
        takeoverPartFive(repeat, skipped, topic);
    }
}

async function takeoverPartFive(repeat, skipped, topic) {
    const partNum = skipped ? "3" : "4";
    const result = await Swal.fire({
        title: `Takeover Part ${partNum}: Show What You Know`,
        html: `<p>Summarise everything you've just learnt in 3 sentences</p><input type="text" id="summaryInput" class="swal2-input" placeholder="Your summary here...">`,
        confirmButtonText: "Submit",
        allowOutsideClick: false,
        preConfirm: () => {
            const v = document.getElementById("summaryInput").value.trim();
            if (!v) { Swal.showValidationMessage("Please enter a summary"); return false; }
            return v;
        }
    });

    if (!result.isConfirmed) return;
    const prompt = `The user has created this report: ${result.value}\nGive the summary a letter grade (A+/-, B+/-, C+/-, D+/-, F+/-). Only respond with the letter grade. Be strict.`;

    try {
        const grade = await callAPI(prompt, "Lumen V");
        const next = skipped ? "5" : "6";
        const { isConfirmed } = await Swal.fire({
            title: "Here's your grade!",
            html: marked.parse(grade),
            confirmButtonText: `Continue to Part ${next}!`,
            className: "swal-wide"
        });
        if (isConfirmed) takeoverPartSix(repeat, skipped);
    } catch (err) {
        console.error(err);
    }
}

async function takeoverPartSix(repeat, skipped) {
    const partNum = skipped ? "5" : "6";
    if (!repeat) {
        const { isConfirmed } = await Swal.fire({
            title: `Takeover Part ${partNum}: One More Round!`,
            text: "Let's see if you can apply what you've just learned in a new question!",
            confirmButtonText: "Let's Go!",
            allowOutsideClick: false
        });
        if (isConfirmed) commenceTakeover(true, false, true, 0, new Set(), 0, null);
    } else {
        takeoverPartSeven(skipped);
    }
}

async function takeoverPartSeven(skipped) {
    const ctx = getContext();
    if (!ctx) return;
    const { selectedFiles, workspace, recentChat } = ctx;
    const prompt = `The user is ready for a real world scenario of where they can use this.\nONLY 2 sentences.\n\nContext:\n${workspace}\n${recentChat}`.trim();

    try {
        const response = await callAPI(prompt, selectedFiles.length ? "Lumen VI" : "Lumen V", selectedFiles[0] ?? null);
        if (typeof stopLoading === "function") stopLoading();
        const partNum = skipped ? "6" : "7";
        await Swal.fire({
            title: `Part ${partNum}: Real World Applications`,
            html: marked.parse(response),
            confirmButtonText: "Finish Takeover",
            allowOutsideClick: false
        });
        takeoverPartEight();
    } catch (err) {
        if (typeof stopLoading === "function") stopLoading();
        Swal.fire("Connection Error", "Lumen was unable to generate a scenario.", "error");
    }
}

function takeoverPartEight() {
    Swal.fire({
        title: "Congrats on completing the takeover!",
        html: `<p>Did you like the takeover?</p>`,
        confirmButtonText: "Yes!",
        showDenyButton: true,
        denyButtonText: "No",
        allowOutsideClick: false
    }).then(() => {
        window.location.reload();
    });
}