document.addEventListener('DOMContentLoaded', () => {
    const csvSelector = document.getElementById('csv-selector');
    const quizArea = document.getElementById('quiz-area');
    const questionCounter = document.getElementById('question-counter');
    const questionText = document.getElementById('question-text');
    const alternativesList = document.getElementById('alternatives-list');
    const submitAnswerButton = document.getElementById('submit-answer');
    const feedbackArea = document.getElementById('feedback-area');
    const resultText = document.getElementById('result');
    const justificationText = document.getElementById('justification');
    const prevQuestionButton = document.getElementById('prev-question');
    const nextQuestionButton = document.getElementById('next-question');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    const statsDisplay = document.getElementById('stats');

    let allQuestions = []; // Array para guardar todas as questões do CSV
    let currentQuestionIndex = 0; // Índice da questão atual na ordem de exibição
    let questionOrder = []; // Array com os índices na ordem de exibição (priorizando erros)
    let userAnswers = {}; // Guarda o estado de acerto/erro { 'csvFile_originalIndex': 'correct'/'incorrect' }
    let currentCsvFile = ''; // Nome do arquivo CSV selecionado
    let selectedAlternative = null; // Alternativa selecionada pelo usuário

    const STORAGE_KEY = 'quizUserAnswers';

    // --- Funções ---

    // Carrega a lista de arquivos CSV do manifest.json
    async function fetchCsvList() {
        try {
            const response = await fetch('src/manifest.json');
            if (!response.ok) {
                throw new Error(`Erro ao carregar manifest.json: ${response.statusText}`);
            }
            const fileList = await response.json();

            csvSelector.innerHTML = '<option value="">-- Selecione um arquivo --</option>'; // Limpa opções antigas
            fileList.forEach(file => {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file;
                csvSelector.appendChild(option);
            });
             csvSelector.disabled = false; // Habilita o seletor
        } catch (error) {
            console.error("Erro ao buscar lista de CSVs:", error);
            showError("Não foi possível carregar a lista de arquivos. Verifique se 'src/manifest.json' existe e está correto.");
            csvSelector.innerHTML = '<option value="">-- Erro ao carregar --</option>';
             csvSelector.disabled = true; // Desabilita se der erro
        }
    }

    // Carrega e processa o arquivo CSV selecionado
    async function loadCsvFile(fileName) {
        if (!fileName) {
            quizArea.style.display = 'none';
            return;
        }
        currentCsvFile = fileName;
        loadingMessage.style.display = 'block';
        quizArea.style.display = 'none';
        errorMessage.style.display = 'none';
        resetQuizState();

        try {
            const response = await fetch(`src/${fileName}`);
            if (!response.ok) {
                throw new Error(`Erro ao carregar ${fileName}: ${response.statusText}`);
            }
            const csvText = await response.text();
            parseCsv(csvText);

            if (allQuestions.length === 0) {
                 throw new Error(`O arquivo ${fileName} está vazio ou não contém questões válidas.`);
            }

            loadUserAnswers(); // Carrega respostas salvas para este arquivo
            sortQuestionOrder(); // Ordena as questões (erradas primeiro)
            currentQuestionIndex = 0;
            displayQuestion(currentQuestionIndex);
            updateStats();
            quizArea.style.display = 'block';

        } catch (error) {
            console.error(`Erro ao carregar ou processar ${fileName}:`, error);
            showError(`Erro ao carregar ${fileName}. Verifique o arquivo e a console para mais detalhes.`);
            resetQuizState(); // Limpa o estado se der erro
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    // Analisa o texto CSV e popula o array allQuestions
    function parseCsv(csvText) {
        allQuestions = [];
        const lines = csvText.split('\n').filter(line => line.trim() !== ''); // Ignora linhas vazias

        lines.forEach((line, index) => {
            // Simples split por ';'. Cuidado se houver ';' dentro dos campos.
            const parts = line.split(';');
            if (parts.length === 8) {
                allQuestions.push({
                    question: parts[0].trim(),
                    a: parts[1].trim(),
                    b: parts[2].trim(),
                    c: parts[3].trim(),
                    d: parts[4].trim(),
                    e: parts[5].trim(),
                    answer: parts[6].trim().toLowerCase(),
                    justification: parts[7].trim(),
                    originalIndex: index // Guarda o índice original para o localStorage
                });
            } else {
                console.warn(`Linha ${index + 1} ignorada: formato inválido (esperado 8 colunas, encontrado ${parts.length}). Conteúdo: ${line}`);
            }
        });
    }

    // Exibe a questão atual
    function displayQuestion(orderIndex) {
        if (orderIndex < 0 || orderIndex >= questionOrder.length) return;

        const questionObj = allQuestions[questionOrder[orderIndex]]; // Pega a questão correta pela ordem
        if (!questionObj) {
            console.error("Objeto da questão não encontrado para o índice:", orderIndex, questionOrder[orderIndex]);
            showError("Erro interno ao tentar exibir a questão.");
            return;
        }

        questionCounter.textContent = `Questão ${orderIndex + 1} de ${allQuestions.length}`;
        questionText.textContent = questionObj.question;
        alternativesList.innerHTML = ''; // Limpa alternativas anteriores
        feedbackArea.style.display = 'none'; // Esconde feedback anterior
        submitAnswerButton.disabled = true; // Desabilita responder até selecionar
        selectedAlternative = null; // Reseta alternativa selecionada

        ['a', 'b', 'c', 'd', 'e'].forEach(key => {
            if (questionObj[key]) { // Só adiciona se a alternativa existir
                const li = document.createElement('li');
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'alternative';
                input.value = key;
                input.id = `alt-${key}`;
                input.addEventListener('change', () => {
                    selectedAlternative = input.value;
                    submitAnswerButton.disabled = false; // Habilita botão ao selecionar
                     // Remove highlight de seleção anterior
                    document.querySelectorAll('#alternatives-list li').forEach(item => item.classList.remove('selected'));
                    li.classList.add('selected'); // Adiciona highlight visual
                });

                const label = document.createElement('label');
                label.htmlFor = `alt-${key}`;
                label.textContent = `${key.toUpperCase()}) ${questionObj[key]}`;

                li.appendChild(input);
                li.appendChild(label);
                alternativesList.appendChild(li);
            }
        });

        // Habilitar/desabilitar botões de navegação
        prevQuestionButton.disabled = orderIndex === 0;
        // Habilita 'Próxima' apenas se já respondeu OU se ainda não chegou ao fim
        const questionKey = `${currentCsvFile}_${questionObj.originalIndex}`;
        const hasAnswered = userAnswers[questionKey] !== undefined;
        nextQuestionButton.disabled = orderIndex === questionOrder.length - 1 || !hasAnswered;

        // Resetar estado visual dos botões de alternativa
        document.querySelectorAll('#alternatives-list input').forEach(input => input.disabled = false);
        document.querySelectorAll('#alternatives-list li').forEach(li => {
             li.classList.remove('correct', 'incorrect', 'selected');
        });
    }

    // Verifica a resposta do usuário
    function checkAnswer() {
        if (!selectedAlternative) return;

        const currentOriginalIndex = questionOrder[currentQuestionIndex];
        const questionObj = allQuestions[currentOriginalIndex];
        const isCorrect = selectedAlternative === questionObj.answer;
        const questionKey = `${currentCsvFile}_${currentOriginalIndex}`;

        resultText.textContent = isCorrect ? "✅ Correto!" : "❌ Incorreto!";
        resultText.className = isCorrect ? "correct" : "incorrect";
        justificationText.textContent = questionObj.justification || "Justificativa não fornecida.";
        feedbackArea.style.display = 'block';

        // Marca a resposta do usuário e a correta
        alternativesList.querySelectorAll('li').forEach(li => {
            const input = li.querySelector('input');
            input.disabled = true; // Desabilita todas após responder

            if (input.value === questionObj.answer) {
                li.classList.add('correct'); // Marca a correta
            }
            if (input.value === selectedAlternative && !isCorrect) {
                li.classList.add('incorrect'); // Marca a incorreta selecionada pelo usuário
            }
             li.classList.remove('selected'); // Remove seleção visual
        });

        // Salva o resultado
        userAnswers[questionKey] = isCorrect ? 'correct' : 'incorrect';
        saveUserAnswers();
        sortQuestionOrder(); // Reordena para a próxima vez que carregar
        updateStats(); // Atualiza estatísticas

        submitAnswerButton.disabled = true; // Desabilita responder novamente
        nextQuestionButton.disabled = currentQuestionIndex === questionOrder.length - 1; // Habilita próxima
    }

    // Vai para a próxima questão
    function nextQuestion() {
        if (currentQuestionIndex < questionOrder.length - 1) {
            currentQuestionIndex++;
            displayQuestion(currentQuestionIndex);
        }
    }

    // Vai para a questão anterior
    function prevQuestion() {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            displayQuestion(currentQuestionIndex);
        }
    }

    // Salva o estado das respostas no localStorage
    function saveUserAnswers() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userAnswers));
        } catch (e) {
            console.error("Erro ao salvar no localStorage:", e);
            showError("Não foi possível salvar seu progresso. O armazenamento local pode estar cheio ou desabilitado.");
        }
    }

    // Carrega o estado das respostas do localStorage
    function loadUserAnswers() {
        const savedAnswers = localStorage.getItem(STORAGE_KEY);
        userAnswers = savedAnswers ? JSON.parse(savedAnswers) : {};
        // Filtra para manter apenas respostas do arquivo atual (opcional, mas bom para limpeza)
        // Ou podemos manter tudo e filtrar na hora de ordenar/contar
    }

    // Cria e ordena o array questionOrder (erradas primeiro, depois não respondidas, depois corretas)
    function sortQuestionOrder() {
        questionOrder = allQuestions.map((_, index) => index); // Cria array [0, 1, 2...]

        questionOrder.sort((indexA, indexB) => {
            const keyA = `${currentCsvFile}_${indexA}`;
            const keyB = `${currentCsvFile}_${indexB}`;
            const statusA = userAnswers[keyA]; // 'correct', 'incorrect', or undefined
            const statusB = userAnswers[keyB];

            const scoreA = statusA === 'incorrect' ? -1 : (statusA === 'correct' ? 1 : 0);
            const scoreB = statusB === 'incorrect' ? -1 : (statusB === 'correct' ? 1 : 0);

            if (scoreA !== scoreB) {
                return scoreA - scoreB; // Ordena por status: incorrect (-1), undefined (0), correct (1)
            }
            return indexA - indexB; // Mantém ordem original para status iguais
        });
         // console.log("Nova ordem das questões:", questionOrder.map(i => allQuestions[i].originalIndex)); // Debug
    }

     // Atualiza exibição de estatísticas
    function updateStats() {
        let correctCount = 0;
        let incorrectCount = 0;
        let unansweredCount = 0;

        allQuestions.forEach((q, index) => {
            const key = `${currentCsvFile}_${q.originalIndex}`;
            const status = userAnswers[key];
            if (status === 'correct') {
                correctCount++;
            } else if (status === 'incorrect') {
                incorrectCount++;
            } else {
                unansweredCount++;
            }
        });
         statsDisplay.textContent = `Corretas: ${correctCount} | Incorretas: ${incorrectCount} | Não respondidas: ${unansweredCount}`;
    }


    // Reseta o estado do quiz ao trocar de arquivo ou em erro
    function resetQuizState() {
        allQuestions = [];
        questionOrder = [];
        currentQuestionIndex = 0;
        selectedAlternative = null;
        quizArea.style.display = 'none';
        prevQuestionButton.disabled = true;
        nextQuestionButton.disabled = true;
        submitAnswerButton.disabled = true;
        feedbackArea.style.display = 'none';
        alternativesList.innerHTML = '';
        questionText.textContent = '';
        questionCounter.textContent = '';
        statsDisplay.textContent = ''; // Limpa stats
    }

     // Mostra mensagem de erro
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    // --- Event Listeners ---
    csvSelector.addEventListener('change', (event) => {
        loadCsvFile(event.target.value);
    });

    submitAnswerButton.addEventListener('click', checkAnswer);
    prevQuestionButton.addEventListener('click', prevQuestion);
    nextQuestionButton.addEventListener('click', nextQuestion);

    // --- Inicialização ---
     csvSelector.disabled = true; // Desabilita enquanto carrega a lista
    fetchCsvList(); // Carrega a lista de arquivos ao iniciar
});