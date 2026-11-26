// Complete English and Brazilian Portuguese text for the public sample deck (fixtures/deck.json).
// The fixture JSON authors prompts, reference answers, options and checklists in English, and
// explanations and distractor reasons in pt-BR. This table supplies each card's other language so
// either locale renders a card entirely in one language. Technical terms, protocol names, code and
// identifiers stay literal. Safe for the app bundle: it imports only types from deck.ts.
import type { Card, ChecklistItem, Choice, LocalizedText, Review } from './deck.ts';

export type FixtureLocale = 'en' | 'pt-BR';
/** English is the default; pt-BR is the only alternative. */
export const FIXTURE_LOCALES: readonly FixtureLocale[] = ['en', 'pt-BR'];

/** Text a fixture card lacks in one locale. Keys mirror the card's fields, checklist ids and choice ids. */
type Supplement = {
  prompt?: string;
  reference?: string;
  explanation?: string;
  checklist?: Record<string, string>;
  choices?: Record<string, string>;
  reasons?: Record<string, string>;
};

const TRANSLATIONS: Record<string, Record<FixtureLocale, Supplement>> = {
  'sd-cache-aside': {
    en: {
      explanation:
        'In cache-aside, the application itself fills and invalidates the cache, so the database and the cache are updated in separate steps. The TTL sets the maximum time data can stay stale; deleting the key after the commit shortens that window but does not eliminate the race in which a slow read writes the old value back. Versions or leases solve that case, at the cost of more complexity.',
    },
    'pt-BR': {
      prompt:
        'Seu serviço lê dados de produtos por meio de uma camada cache-aside na frente do banco de dados. Como um leitor pode ver dados desatualizados, e como você limitaria isso?',
      reference:
        'No cache-aside, a aplicação consulta primeiro o cache; se a chave não estiver lá (cache miss), lê o banco de dados e grava o resultado no cache. Um leitor vê dados desatualizados quando o banco muda, mas a entrada em cache continua valendo até expirar ou ser invalidada. Uma condição de corrida também pode recolocar um valor antigo: um leitor não encontra a chave e carrega a linha antiga, o escritor faz o commit e apaga a chave, e então o leitor grava o valor antigo no cache. Limite a desatualização com um TTL compatível com o atraso tolerado e apagando a chave depois do commit da escrita no banco; use valores versionados ou leases curtos quando uma regravação tardia não puder prevalecer. Limites mais rígidos reduzem a taxa de acerto do cache e aumentam a carga no banco.',
      checklist: {
        'read-path': 'Descreve o caminho de leitura: consultar o cache, ler o banco quando a chave não está no cache e então preencher o cache.',
        'stale-source': 'Explica que uma atualização no banco deixa a entrada em cache desatualizada até ela expirar ou ser invalidada.',
        bound: 'Propõe um TTL e/ou apagar a chave depois do commit da escrita no banco.',
        race: 'Descreve a condição de corrida em que um leitor lento regrava um valor antigo depois da invalidação.',
        'trade-off': 'Aponta a troca entre dados mais atualizados e a taxa de acerto do cache ou a carga no banco.',
      },
    },
  },
  'sd-rate-limit': {
    en: {
      explanation:
        'With counters in local memory, each instance would enforce the limit separately and the user could get 100 requests per instance. A shared store with atomic updates prevents two instances from reading the same value and both accepting the request. The choice of algorithm trades accuracy for memory: the fixed window accepts bursts of up to twice the limit at the window boundary, while the token bucket smooths bursts with constant memory.',
    },
    'pt-BR': {
      prompt:
        'Projete um limite de 100 requisições por minuto por usuário para uma API servida por várias instâncias sem estado. Onde fica o contador, e o que o seu algoritmo sacrifica em troca?',
      reference:
        'Como as instâncias não guardam estado e as requisições de um usuário podem chegar a qualquer uma delas, o contador precisa ficar em um armazenamento compartilhado e de baixa latência, como o Redis, com uma chave por usuário e atualização atômica (por exemplo, INCR com expiração, ou um script que verifica e incrementa em um único passo). Uma janela fixa é barata, mas permite até o dobro do limite na virada entre duas janelas; um registro de janela deslizante é exato, mas guarda um horário por requisição; um contador de janela deslizante ou um token bucket suaviza rajadas com memória constante por usuário. Decida o que acontece quando o armazenamento estiver indisponível: falhar aberto (fail-open) mantém a API disponível, falhar fechado (fail-closed) protege o backend. Rejeite com HTTP 429 e um cabeçalho Retry-After.',
      checklist: {
        'shared-store': 'Mantém o contador em um armazenamento compartilhado por todas as instâncias, e não na memória de cada uma.',
        atomic: 'Atualiza o contador de forma atômica.',
        algorithm: 'Cita um algoritmo e sua troca entre precisão e memória, como a rajada na virada da janela fixa.',
        'store-failure': 'Escolhe entre falhar aberto ou falhar fechado quando o armazenamento estiver indisponível.',
        response: 'Responde com HTTP 429 e Retry-After.',
      },
    },
  },
  'sd-idempotency': {
    en: {
      explanation:
        'A timeout does not mean failure: the first request may have been charged and only the response was lost. The idempotency key turns the retry into a lookup of the outcome already recorded. It only protects you if it is recorded in the same transaction as the charge; recording it afterwards leaves a window in which a failure between the two steps causes a double charge.',
    },
    'pt-BR': {
      prompt:
        'Um app móvel repete uma requisição de "criar pagamento" depois de um timeout. Como garantir que o cliente seja cobrado só uma vez?',
      reference:
        'Um timeout não informa ao app se a primeira requisição foi processada, então as novas tentativas precisam ser seguras. O app gera uma chave de idempotência para a operação lógica e envia a mesma chave em toda nova tentativa. O servidor registra a chave, uma impressão digital da requisição e o resultado na mesma transação do pagamento, garantidos por uma restrição de unicidade. Uma nova tentativa com uma chave conhecida devolve o resultado armazenado em vez de cobrar de novo; a mesma chave com dados de requisição diferentes é rejeitada. Duplicatas concorrentes são serializadas pela restrição ou por um lock, e as chaves são mantidas por mais tempo que a janela de novas tentativas do app.',
      checklist: {
        'client-key': 'O app envia a mesma chave de idempotência em toda nova tentativa de uma mesma operação.',
        'atomic-record': 'O servidor grava a chave e o resultado de forma atômica com a cobrança, por exemplo sob uma restrição de unicidade.',
        replay: 'Uma nova tentativa com uma chave conhecida devolve o resultado original sem uma segunda cobrança.',
        'payload-mismatch': 'Rejeita o reúso de uma chave com dados de requisição diferentes.',
        concurrency: 'Trata duplicatas concorrentes e define por quanto tempo as chaves são mantidas.',
      },
    },
  },
  'sd-backpressure': {
    en: {
      explanation:
        'A queue absorbs short spikes, but it does not fix an incoming rate higher than the outgoing rate for hours. More consumers only help if the worker itself is the bottleneck; if the database or another downstream service is at its limit, adding consumers makes things worse. Backpressure hands the problem back to the producer explicitly, instead of letting the queue grow until it fails.',
    },
    'pt-BR': {
      prompt:
        'Um serviço de upload publica tarefas de processamento de imagens em uma fila. Por várias horas, os produtores adicionam tarefas mais rápido do que os workers conseguem concluí-las. O que acontece, e como você reage?',
      reference:
        'O tamanho da fila cresce sem limite, então cada nova tarefa espera mais; o broker pode ficar sem memória ou disco, e mensagens podem expirar ou ser descartadas. Se os workers forem o gargalo e as dependências a jusante tiverem folga, adicione consumidores. Se não tiverem, aplique backpressure no produtor: limite o tamanho da fila e rejeite ou adie novos uploads com um erro que permita nova tentativa, ou degrade o serviço fazendo primeiro o trabalho mais barato. Configure alertas e escalonamento automático pelo tamanho da fila e pela idade da mensagem mais antiga, e não apenas pelo uso de CPU. Mantenha os workers idempotentes, porque as reentregas aumentam sob carga.',
      checklist: {
        growth: 'Reconhece o crescimento sem limite do tamanho da fila e da latência das tarefas.',
        consumers: 'Propõe adicionar consumidores verificando a capacidade dos serviços a jusante.',
        backpressure: 'Propõe backpressure ou descarte de carga no produtor.',
        signals: 'Monitora ou escala automaticamente pelo tamanho da fila ou pela idade da mensagem mais antiga.',
        idempotent: 'Mantém os consumidores idempotentes, porque as reentregas aumentam.',
      },
    },
  },
  'sd-consistent-hashing': {
    en: {
      explanation:
        'With modulo, changing N changes the destination of almost every key, and the cache is practically emptied at once. On a consistent hashing ring, each node owns a segment; when a node joins or leaves, only the keys in that segment move, about 1/N of the total.',
      reasons: {
        a: 'Without virtual nodes the distribution can be quite uneven; with them the balance improves, but it remains approximate.',
        c: 'Hashing only decides where each key lives; surviving the loss of a node still requires replicas.',
        d: 'Modulo is O(1); a lookup on the ring is usually a binary search, O(log N) over the points on the ring.',
      },
    },
    'pt-BR': {
      prompt: 'Por que distribuir chaves entre N nós de cache com hashing consistente em vez de hash(key) % N?',
      choices: {
        a: 'Garante que todos os nós armazenem exatamente o mesmo número de chaves.',
        b: 'Adicionar ou remover um nó remapeia só cerca de 1/N das chaves, em vez da maioria delas.',
        c: 'Elimina a necessidade de replicar dados entre os nós.',
        d: 'Suas buscas são O(1), enquanto o hashing por módulo precisa de O(log N).',
      },
    },
  },
  'sd-partition-writes': {
    en: {
      explanation:
        'Under the CAP theorem, during a partition the system chooses between always responding (availability) and guaranteeing that every read sees the most recent write (linearizable consistency). Accepting writes on both sides and reconciling later is the AP choice: readers may see divergent values until reconciliation, and the resolution rule may discard one of the writes.',
      reasons: {
        a: 'Accepting writes on both sides is precisely how the system stays available during the partition.',
        b: 'The system keeps operating while the network is split; that is what partition tolerance describes.',
        d: 'Horizontal scalability is not part of the CAP theorem and is not affected by the choice described.',
      },
    },
    'pt-BR': {
      prompt:
        'Durante uma partição de rede, um armazenamento chave-valor replicado continua aceitando escritas dos dois lados e as reconcilia depois. De qual garantia ele abriu mão?',
      choices: {
        a: 'Disponibilidade',
        b: 'Tolerância a partição',
        c: 'Consistência linearizável',
        d: 'Escalabilidade horizontal',
      },
    },
  },
  'net-l4-l7': {
    en: {
      explanation:
        'The difference lies in what the load balancer sees. At Layer 4 it sees only addresses and ports, so it decides per connection and does not know which route was requested. At Layer 7 it reads the HTTP request and can decide by path, header or cookie. That visibility costs processing, latency and the responsibility of terminating TLS.',
    },
    'pt-BR': {
      prompt: 'Quando um balanceador de carga de camada 7 seria uma escolha melhor que um de camada 4? Cite uma contrapartida.',
      reference:
        'Um balanceador de carga de camada 7 termina o protocolo de aplicação, geralmente HTTP, então consegue rotear por host, caminho, cabeçalho ou cookie, repetir requisições idempotentes e aplicar políticas por rota, como autenticação ou limites de taxa. Escolha-o quando o roteamento depender do conteúdo da requisição, por exemplo para enviar /api e /static a serviços diferentes ou mandar requisições com um cabeçalho de canário para uma nova versão. Um balanceador de camada 4 encaminha conexões TCP ou UDP por endereço e porta sem interpretar o conteúdo, então adiciona menos latência, funciona com qualquer protocolo e pode repassar o TLS intacto até o backend. A contrapartida: a camada 7 consome mais CPU e latência, precisa guardar os certificados quando termina o TLS e é mais um componente que precisa entender o protocolo corretamente.',
      checklist: {
        'l7-routing': 'Afirma que a camada 7 pode rotear pelo conteúdo da requisição, como host, caminho, cabeçalhos ou cookies.',
        'l4-forwarding': 'Afirma que a camada 4 encaminha conexões por endereço e porta sem inspecionar o conteúdo.',
        'trade-off': 'Cita uma contrapartida, como o custo extra de CPU e latência da camada 7 ou a necessidade de terminar o TLS.',
        protocols: 'Menciona que a camada 4 lida com protocolos TCP/UDP arbitrários ou repassa o TLS sem terminá-lo.',
        'use-case': 'Dá um caso de uso concreto da camada 7, como roteamento por caminho ou canário por cabeçalho.',
      },
    },
  },
  'net-connection-setup': {
    en: {
      explanation:
        'Each handshake costs at least one full round trip over the network, and on mobile networks latency dominates response time. Reusing the connection eliminates the subsequent handshakes; HTTP/3 merges transport and TLS into a single handshake; and a CDN shortens the physical distance of each round trip. 0-RTT saves one more round trip, but that early data can be resent by an attacker.',
    },
    'pt-BR': {
      prompt:
        'Por que uma nova conexão HTTPS pode levar várias idas e voltas antes de chegar o primeiro byte da resposta, e como reduzir esse custo?',
      reference:
        'Antes de enviar a requisição, o cliente pode precisar de uma consulta DNS, depois do handshake de três vias do TCP (uma ida e volta antes de poder enviar dados) e então do handshake TLS (uma ida e volta no TLS 1.3, duas no TLS 1.2). Só então a requisição sai e a resposta volta. Em uma rede móvel, cada ida e volta pode custar de dezenas a centenas de milissegundos. Reduza o custo reutilizando conexões (keep-alive, multiplexação do HTTP/2), retomando sessões TLS, usando 0-RTT só para requisições que podem ser repetidas com segurança, adotando HTTP/3 sobre QUIC, que combina os handshakes de transporte e de TLS, guardando em cache as respostas de DNS e terminando as conexões mais perto dos usuários por meio de um CDN.',
      checklist: {
        tcp: 'Identifica o handshake TCP como uma ida e volta antes que a requisição possa ser enviada.',
        tls: 'Identifica a ida e volta adicional (ou as duas) do handshake TLS.',
        reuse: 'Propõe reutilizar ou retomar conexões para que os handshakes não se repitam.',
        dns: 'Menciona a resolução DNS antes da conexão.',
        'quic-edge': 'Menciona HTTP/3 (QUIC) ou terminação na borda para eliminar ou encurtar idas e voltas.',
        replay: 'Observa que dados 0-RTT podem ser reenviados por um atacante, então só servem para requisições seguras.',
      },
    },
  },
  'net-dns-ttl': {
    en: {
      explanation:
        'The TTL is how long a cached answer stays valid. Lowering it only on the day of the switch does not help: resolvers that already stored the record with a long TTL will only query it again when it expires. That is why the reduction must happen at least one old TTL in advance, and the old endpoint must keep serving while there is traffic.',
    },
    'pt-BR': {
      prompt:
        'Amanhã você vai apontar um domínio para o IP de um novo balanceador de carga. Como o TTL do DNS afeta a migração, e o que você faria antes?',
      reference:
        'Os resolvers guardam o registro em cache pelo tempo do TTL, então, depois da mudança, alguns clientes continuam usando o IP antigo até a cópia em cache expirar; com um TTL de 24 horas, o tráfego pode ficar dividido por até um dia. Reduza o TTL, por exemplo para 60 segundos, com pelo menos um TTL antigo de antecedência, para que os caches recebam o valor curto. Mantenha o endpoint antigo atendendo ou repassando as requisições durante a sobreposição, troque o registro e aumente o TTL de novo quando o novo endpoint estiver estável. Alguns clientes e resolvers ignoram os TTLs ou impõem limites próprios a eles, então acompanhe o tráfego no IP antigo antes de desligá-lo.',
      checklist: {
        caching: 'Explica que os resolvers guardam o registro em cache pelo tempo do TTL, então alguns clientes mantêm o IP antigo até ele expirar.',
        'lower-early': 'Reduz o TTL com antecedência, pelo menos um TTL antigo antes da mudança.',
        overlap: 'Mantém o endpoint antigo funcionando durante a sobreposição.',
        stragglers: 'Observa que alguns clientes ignoram o TTL e verifica o tráfego no IP antigo antes de desativá-lo.',
        restore: 'Aumenta o TTL de novo depois da migração.',
      },
    },
  },
  'net-push-updates': {
    en: {
      explanation:
        'The three options trade simplicity for latency and connection cost. Short polling is the simplest but pays for empty requests; long polling reduces the delay but keeps many requests open; WebSockets deliver with little overhead but require handling long-lived connections, reconnection and message distribution. For updates that only flow from server to client, SSE is usually enough.',
    },
    'pt-BR': {
      prompt:
        'Um painel precisa mostrar mudanças de status de pedidos em poucos segundos. Compare short polling, long polling e WebSockets para essa necessidade.',
      reference:
        'O short polling pede atualizações em um intervalo fixo: é simples e se dá bem com caches e proxies, mas desperdiça requisições quando nada muda e adiciona até um intervalo de atraso. O long polling mantém cada requisição aberta até haver uma atualização ou um timeout, o que dá entrega quase em tempo real sobre HTTP comum, ao custo de muitas conexões presas e de uma nova requisição depois de cada mensagem. WebSockets mantêm uma única conexão bidirecional com pouco overhead por mensagem, o que combina com atualizações frequentes, mas exigem balanceadores de carga que suportem conexões longas, heartbeats, lógica de reconexão e infraestrutura para distribuir mensagens a muitos clientes. Server-Sent Events são uma opção unidirecional mais simples sobre HTTP. Com atualização em poucos segundos e muitos clientes, um canal de push como SSE ou WebSockets costuma ser o mais adequado; short polling ainda pode ser aceitável em pequena escala.',
      checklist: {
        short: 'Descreve as requisições desperdiçadas do short polling e o atraso limitado pelo intervalo.',
        long: 'Descreve o long polling mantendo uma requisição aberta até haver dados ou um timeout.',
        websocket: 'Descreve WebSockets como uma conexão bidirecional persistente e cita um custo operacional.',
        sse: 'Menciona Server-Sent Events como alternativa unidirecional.',
        choice: 'Escolhe com base na frequência de atualização e no número de clientes.',
      },
    },
  },
  'net-udp-realtime': {
    en: {
      explanation:
        'TCP delivers bytes in order: if a segment is lost, the data after it waits for the retransmission (head-of-line blocking). For real-time positions, the newest packet is worth more than the old one, so it is better to skip the loss and move on. That is why games usually use UDP and implement only the reliability they need.',
      reasons: {
        a: 'UDP guarantees neither delivery nor ordering; any reliability has to be implemented by the application.',
        b: 'TCP carries an arbitrary stream of bytes, including binary data.',
        c: 'Routers drop UDP datagrams under congestion like any other packet.',
      },
    },
    'pt-BR': {
      prompt: 'Um jogo multiplayer envia as posições dos jogadores 30 vezes por segundo. Por que ele usaria UDP em vez de TCP?',
      choices: {
        a: 'UDP garante a entrega com menos overhead que TCP.',
        b: 'TCP não consegue transportar dados binários.',
        c: 'Roteadores nunca descartam datagramas UDP.',
        d: 'Uma atualização perdida logo é substituída, e o TCP seguraria os dados mais novos enquanto retransmite o antigo.',
      },
    },
  },
  'net-rate-limit-status': {
    en: {
      explanation:
        '429, defined in RFC 6585, reports that the client sent too many requests within a time window. The Retry-After header can say when to try again, which lets the client back off without treating the case as a permission error or a server failure.',
      reasons: {
        a: '400 indicates a malformed request; here the request is valid.',
        b: '403 indicates a lack of permission for the resource and does not convey that simply waiting is enough before trying again.',
        d: '503 signals that the server is unavailable, not that a limit was applied to this client.',
      },
    },
    'pt-BR': {
      prompt:
        'Um cliente envia uma requisição bem formada, mas excedeu o limite de taxa. Qual código de status a API deve retornar?',
      // HTTP status lines are protocol identifiers and stay literal in every locale.
      choices: {
        a: '400 Bad Request',
        b: '403 Forbidden',
        c: '429 Too Many Requests',
        d: '503 Service Unavailable',
      },
    },
  },
  'db-composite-index': {
    en: {
      explanation:
        'A B-tree index is ordered by its first column and, within it, by the second. With customer_id first, the rows of one customer are contiguous and already in created_at order, so the database reads only that range and skips the sort. In exchange, every write to the table must also update the index.',
    },
    'pt-BR': {
      prompt:
        'Uma consulta frequente filtra pedidos por customer_id e os ordena por created_at. Que índice você adicionaria, e qual é o custo dele?',
      reference:
        'Adicione um índice B-tree composto em (customer_id, created_at). O banco consegue ir direto às entradas de um cliente e lê-las já ordenadas por created_at, evitando uma varredura completa e uma ordenação separada. A ordem das colunas importa: primeiro a coluna filtrada por igualdade, depois a coluna de ordenação. Incluir as colunas selecionadas (um índice de cobertura) também pode evitar buscar as linhas na tabela. O custo é que toda inserção, exclusão e atualização de colunas indexadas precisa manter o índice, o que deixa as escritas mais lentas e consome armazenamento e memória. Confirme o ganho com o plano de execução antes e depois.',
      checklist: {
        composite: 'Propõe um índice composto com a coluna de igualdade primeiro e a coluna de ordenação em segundo.',
        'avoids-work': 'Explica que o índice evita uma varredura completa e uma ordenação separada.',
        'write-cost': 'Cita o custo de escrita e de armazenamento para manter o índice.',
        covering: 'Menciona um índice de cobertura para evitar buscas na tabela.',
        verify: 'Verifica o efeito com o plano de execução (EXPLAIN).',
      },
    },
  },
  'db-lost-update': {
    en: {
      explanation:
        'The problem is reading, deciding in the application and writing without the database knowing about the dependency between those steps. The conditional update moves the decision into the database in a single statement; the lock makes the second transaction wait; the optimistic version detects the conflict and asks for a retry. At the default isolation levels of common databases, such as READ COMMITTED, this read followed by a write is not protected automatically.',
    },
    'pt-BR': {
      prompt:
        'Duas requisições leem o estoque de um produto como 1, ambas aceitam um pedido e ambas gravam o estoque como 0. Agora existem dois pedidos para um único item. Dê o nome da anomalia e duas formas de evitá-la.',
      reference:
        'Isso é uma atualização perdida (lost update): as duas transações leem o mesmo valor e gravam resultados calculados a partir dele, então um dos decrementos desaparece e o estoque deixa de bater com os pedidos. Evite com uma atualização condicional atômica (UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0, verificando em seguida o número de linhas afetadas), com lock pessimista (SELECT ... FOR UPDATE antes de decidir), com concorrência otimista (uma coluna de versão verificada no UPDATE e nova tentativa em caso de conflito) ou com um nível de isolamento que detecte o conflito, como SERIALIZABLE, repetindo as transações abortadas. Cada opção equilibra de um jeito diferente a disputa por locks, as novas tentativas e a latência.',
      checklist: {
        anomaly: 'Nomeia a anomalia como atualização perdida, causada por ler e depois escrever sem coordenação.',
        atomic: 'Propõe um UPDATE condicional atômico ou um lock de linha.',
        second: 'Propõe um segundo mecanismo diferente, como verificação otimista de versão ou isolamento SERIALIZABLE com novas tentativas.',
        rows: 'Verifica o número de linhas afetadas ou tenta de novo em caso de conflito.',
        'trade-off': 'Cita uma contrapartida, como disputa por locks ou novas tentativas.',
      },
    },
  },
  'db-replica-lag': {
    en: {
      explanation:
        'Asynchronous replicas receive changes with a delay, so the same read can return different answers depending on which replica is chosen. Reading from the primary right after a write guarantees that users see their own change without requiring synchronous replication for the whole system.',
    },
    'pt-BR': {
      prompt:
        'Depois que usuários editam o perfil, a página seguinte às vezes mostra os dados antigos. O app lê de réplicas assíncronas. Por quê, e o que você faria?',
      reference:
        'Com replicação assíncrona, o primário confirma o commit antes que as réplicas o apliquem, então uma leitura direcionada a uma réplica atrasada devolve a versão anterior. Garanta que cada usuário leia as próprias escritas (read-your-writes): direcione as leituras desse usuário ao primário por um curto período depois de uma escrita, ou até que uma réplica tenha aplicado a posição de log dessa escrita; fixar o usuário em uma única réplica também impede que as leituras dele voltem no tempo. Replicação síncrona ou semissíncrona reduz essa diferença ao custo de latência de escrita e de disponibilidade. Em qualquer caso, monitore o atraso de replicação.',
      checklist: {
        async: 'Explica que réplicas assíncronas aplicam os commits depois que o primário já os confirmou.',
        'read-your-writes':
          'Propõe garantir a leitura das próprias escritas, por exemplo lendo do primário depois de uma escrita ou esperando a réplica alcançar a posição de log.',
        cost: 'Cita o custo da solução, como mais carga no primário ou maior latência de escrita.',
        monitor: 'Menciona o monitoramento do atraso de replicação.',
        sync: 'Menciona replicação síncrona ou semissíncrona como alternativa.',
      },
    },
  },
  'db-n-plus-one': {
    en: {
      explanation:
        'Each extra query pays for a network round trip and execution work in the database, even when it is small. With 50 items, that fixed cost repeats 50 times. Fetching the related data in bulk turns N queries into one or two, with a nearly constant cost relative to the page size.',
    },
    'pt-BR': {
      prompt: 'Um endpoint que lista 50 pedidos executa 51 consultas no banco de dados. O que está acontecendo, e como corrigir?',
      reference:
        'Esse é o problema de consultas N+1: uma consulta carrega os pedidos e depois o código, muitas vezes pelo carregamento preguiçoso (lazy loading) de um ORM, executa mais uma consulta por pedido para buscar dados relacionados, como o cliente. Cada consulta paga uma ida e volta e o custo de execução, então a latência cresce com o tamanho da página. Em vez disso, carregue os dados relacionados em lote: um JOIN, ou uma consulta extra com WHERE id IN (...) por meio de carregamento antecipado (eager loading), e depois associe os resultados em memória. Um JOIN em uma relação um-para-muitos repete as colunas do registro pai em cada linha, então compare o volume de dados transferido. Detecte regressões com logs de consultas ou com um teste que conta as consultas.',
      checklist: {
        pattern: 'Identifica o padrão N+1: uma consulta para a lista mais uma por item.',
        batch: 'Propõe buscar em lote com um JOIN, uma consulta IN ou carregamento antecipado.',
        latency: 'Explica que a ida e volta de cada consulta faz a latência crescer com o número de itens.',
        duplication: 'Observa a contrapartida dos JOINs: linhas duplicadas ou dados buscados em excesso.',
        detect: 'Sugere detectar o problema com logs de consultas ou um teste que conta consultas.',
      },
    },
  },
  'db-atomicity': {
    en: {
      explanation:
        'Atomicity means all or nothing: either every operation in the transaction is applied, or none is. On restart, the database uses the log to discard the effects of uncommitted transactions, so the debit without its matching credit does not remain.',
      reasons: {
        b: 'Consistency requires the transaction to preserve the rules of the database, such as constraints; undoing partial work is the job of atomicity.',
        c: 'Isolation deals with interference between concurrent transactions, not with a failure in the middle of a transaction.',
        d: 'Durability guarantees that committed transactions survive failures; this transaction was never committed.',
      },
    },
    'pt-BR': {
      prompt:
        'Uma transferência debita a conta A e depois credita a conta B em uma única transação. O servidor cai depois do débito. Qual propriedade ACID garante que o débito seja desfeito?',
      choices: {
        a: 'Atomicidade',
        b: 'Consistência',
        c: 'Isolamento',
        d: 'Durabilidade',
      },
    },
  },
  'db-index-prefix': {
    en: {
      explanation:
        'A composite index is ordered by its first column and, within it, by the second. That is why it serves searches that fix the leading column (the leftmost-prefix rule). Filters that skip that column, transform its value or start with a wildcard cannot use that ordering to go straight to the rows.',
      reasons: {
        a: 'Without a filter on the leading column, the database cannot position itself on a single range of the index; some databases use a skip scan, which only pays off when the first column has few distinct values.',
        b: 'Applying a function to the column prevents the use of the plain index; it would need an expression index on lower(last_name).',
        c: 'A leading wildcard prevents a prefix search, because the index is ordered by the beginning of the value.',
      },
    },
    'pt-BR': {
      prompt:
        'Uma tabela tem um índice B-tree em (last_name, first_name). Qual filtro consegue usá-lo para ir direto às entradas correspondentes?',
      // SQL filters are code and stay literal in every locale.
      choices: {
        a: "WHERE first_name = 'Ana'",
        b: "WHERE lower(last_name) = 'silva'",
        c: "WHERE last_name LIKE '%silva'",
        d: "WHERE last_name = 'Silva'",
      },
    },
  },
  'algo-hash-map': {
    en: {
      explanation:
        'The O(1) is an average that depends on two conditions: the hash spreads keys well, and the table grows before it gets too full. If many keys land in the same bucket, the lookup becomes a scan of that bucket. That is why attacker-controlled input can degrade performance, and several languages use hash functions with a random seed.',
    },
    'pt-BR': {
      prompt: 'Por que a busca em uma tabela hash é descrita como O(1) em média, e quando ela pode se degradar?',
      reference:
        'Uma função de hash mapeia a chave para o índice de um balde, então uma busca calcula o hash da chave e inspeciona um único balde. Com um hash que espalha bem as chaves e um fator de carga mantido sob controle pelo redimensionamento, cada balde guarda um número esperado constante de entradas, o que dá busca O(1) em média; redimensionar custa O(n) de vez em quando, mas, amortizado entre as inserções, continua O(1) por inserção. A busca se degrada quando muitas chaves colidem, por causa de uma função de hash ruim, de entradas maliciosas (hash flooding) ou de um fator de carga que pode crescer sem controle, chegando a O(n) quando o balde é uma lista encadeada. Funções de hash com semente e baldes em árvore limitam esse pior caso; o HashMap do Java, por exemplo, transforma baldes longos em árvores balanceadas.',
      checklist: {
        bucket: 'Explica que o hash da chave aponta para um balde, que então é inspecionado.',
        'load-factor': 'Relaciona o O(1) médio a um fator de carga limitado, mantido pelo redimensionamento.',
        collisions: 'Aponta as colisões como causa da degradação em direção a O(n).',
        amortized: 'Menciona que o custo do redimensionamento é amortizado.',
        flooding: 'Menciona hash flooding e defesas como funções de hash com semente ou baldes em árvore.',
      },
    },
  },
  'algo-lower-bound': {
    en: {
      explanation:
        'The invariant states what is already known about each side of the range, and each comparison discards half without breaking that guarantee. When the range becomes empty, lo is exactly the boundary between the values smaller than the target and the rest. Off-by-one errors appear when the bounds are updated without respecting the invariant, for example with hi = mid - 1 in a half-open range.',
    },
    'pt-BR': {
      prompt:
        'Explique como a busca binária encontra o primeiro índice cujo valor é maior ou igual a um alvo em um array ordenado. Qual invariante evita erros de ±1?',
      reference:
        'Mantenha um intervalo semiaberto [lo, hi) com lo = 0 e hi = n, e o invariante de que todo índice antes de lo guarda um valor menor que o alvo e todo índice a partir de hi guarda um valor maior ou igual a ele. Enquanto lo < hi, calcule mid = lo + (hi - lo) / 2; se a[mid] < target, faça lo = mid + 1, senão faça hi = mid. O intervalo diminui a cada passo, então o laço termina após O(log n) iterações, e quando lo == hi esse índice é a resposta, que vale n quando nenhum elemento atende à condição. Calcular mid como lo + (hi - lo) / 2 evita estouro de inteiro em linguagens com inteiros de tamanho fixo.',
      checklist: {
        invariant: 'Enuncia o invariante: os valores antes de lo são menores que o alvo, e os valores a partir de hi não são.',
        shrink: 'Atualiza os limites de modo que o intervalo sempre diminua (lo = mid + 1 ou hi = mid).',
        result: 'Retorna lo quando o intervalo fica vazio, inclusive n quando nenhum elemento atende à condição.',
        complexity: 'Afirma que o tempo é O(log n).',
        overflow: 'Calcula mid sem estouro de inteiro.',
      },
    },
  },
  'algo-bfs-shortest': {
    en: {
      explanation:
        'BFS processes every state one move away, then every state two moves away, and so on. That is why the first time it finds the target, it has already done so with the fewest edges. DFS follows a path to the end before backtracking, so it may find a long route first. The price of BFS is keeping the whole frontier in memory.',
    },
    'pt-BR': {
      prompt:
        'Você precisa do número mínimo de movimentos entre dois estados em um grafo sem pesos. Por que escolher BFS em vez de DFS, e quanto custa a BFS?',
      reference:
        'A BFS visita os nós em ordem de distância a partir da origem, então, na primeira vez que alcança o alvo, usou o menor número de arestas. A DFS pode chegar ao alvo primeiro por um caminho longo e teria de continuar explorando para provar que não existe caminho mais curto. A BFS roda em tempo O(V + E), precisa de um conjunto de visitados para que nenhum estado seja processado duas vezes e mantém a fronteira inteira na memória, o que pode chegar a O(V). Com arestas ponderadas, use o algoritmo de Dijkstra; quando as duas pontas são conhecidas, a BFS bidirecional costuma explorar muito menos estados.',
      checklist: {
        order: 'Explica que a BFS explora por distância crescente, então a primeira chegada ao alvo é por um caminho mais curto.',
        dfs: 'Explica por que a DFS não garante o caminho mais curto.',
        memory: 'Cita o custo de memória da fronteira da BFS e a necessidade de um conjunto de visitados.',
        complexity: 'Afirma que o tempo é O(V + E).',
        variants: 'Menciona Dijkstra para grafos ponderados ou a BFS bidirecional.',
      },
    },
  },
  'algo-top-k': {
    en: {
      explanation:
        'Counting is linear and unavoidable. The interesting question is how to select the k largest: sorting everything works, but costs O(m log m). A min-heap of size k always discards the smallest candidate, so each operation costs O(log k). When k is small relative to m, the difference is large.',
    },
    'pt-BR': {
      prompt: 'Retorne as k palavras mais frequentes de uma lista de n palavras. Descreva uma abordagem e sua complexidade.',
      reference:
        'Conte as frequências com uma tabela hash em tempo O(n). Depois mantenha um heap mínimo com no máximo k entradas, ordenado pela contagem: insira cada palavra distinta e remova a menor sempre que o heap passar de k. Para m palavras distintas, isso custa tempo O(m log k) e memória extra O(k), menos que ordenar todas as m palavras em O(m log m) quando k é pequeno. Agrupar as palavras em baldes por contagem dá O(n + m), ao custo de um array indexado pela frequência. Se os dados forem grandes demais para contar com exatidão, contagens aproximadas, como um Count-Min Sketch combinado com um heap, trocam precisão por memória.',
      checklist: {
        count: 'Conta as frequências com uma tabela hash.',
        heap: 'Mantém os k maiores com um heap mínimo de tamanho k ou uma seleção equivalente.',
        complexity: 'Informa a complexidade, por exemplo O(n + m log k).',
        alternatives: 'Compara com ordenar todas as palavras distintas ou agrupá-las em baldes por frequência.',
        approximate: 'Menciona contagem aproximada quando as contagens exatas não cabem na memória.',
      },
    },
  },
  'algo-quicksort-pivot': {
    en: {
      explanation:
        'With the first element as the pivot, an already sorted array produces partitions of size 0 and n − 1 at every step, adding up to n + (n − 1) + ... ≈ n²/2 comparisons. Choosing the pivot at random or by median of three makes this case unlikely.',
      reasons: {
        b: 'In random order, the partitions tend to be balanced and the expected time is O(n log n).',
        c: 'The size of the array does not affect the choice of pivot or the balance of the partitions.',
        d: 'The cache affects the constant factors of performance, not the asymptotic complexity.',
      },
    },
    'pt-BR': {
      prompt: 'Um quicksort sempre escolhe o primeiro elemento como pivô. Qual entrada faz com que ele rode em tempo O(n²)?',
      choices: {
        a: 'Um array que já está ordenado',
        b: 'Um array de valores distintos em ordem aleatória',
        c: 'Um array cujo tamanho é uma potência de dois',
        d: 'Um array pequeno o bastante para caber no cache da CPU',
      },
    },
  },
  'algo-nested-search': {
    en: {
      explanation: 'There are n iterations, and each one performs a binary search costing O(log n). Multiplying them, the total is O(n log n).',
      reasons: {
        a: 'That would treat binary search as O(1); each search costs O(log n).',
        c: 'That would be the case with a linear search inside the loop; binary search costs O(log n).',
        d: 'It ignores the outer loop, which runs n times.',
      },
    },
    'pt-BR': {
      prompt:
        'Uma função percorre n itens e, para cada um, executa uma busca binária em um array ordenado de n elementos. Qual é a complexidade de tempo dela?',
      // Big-O expressions are notation and stay literal in every locale.
      choices: {
        a: 'O(n)',
        b: 'O(n log n)',
        c: 'O(n²)',
        d: 'O(log n)',
      },
    },
  },
};

const own = (record: Record<string, string> | undefined, key: string): string | undefined =>
  record !== undefined && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

/** Ids of the fixture cards this module can localize, sorted. */
export function translatedFixtureIds(): string[] {
  return Object.keys(TRANSLATIONS).sort();
}

/**
 * Returns a copy of a fixture card whose every display text (prompt, reference, checklist items,
 * options, distractor reasons, explanation) carries the requested locale. Text the fixture already
 * has in that locale is kept verbatim; the rest comes from the translation table. Ids, type, topic,
 * answer, required flags and item order are unchanged, so progress keyed by card id survives a
 * language switch. Never falls back to the other language.
 * @param card A card from fixtures/deck.json; the input is not modified.
 * @param locale
 * @returns The same Card shape with `text[locale]` defined on every display field.
 * @throws Error naming the card id and field (never its text) when any display text would be missing
 *   in that locale, when a field is defined both in the fixture and in the table, or when a
 *   translation does not match a field of the card.
 */
export function localizeFixtureCard<T extends Card>(card: T, locale: FixtureLocale): T {
  if (!FIXTURE_LOCALES.includes(locale)) throw new Error(`unsupported locale ${String(locale)}`);
  const source: Card = card;
  const entry = Object.prototype.hasOwnProperty.call(TRANSLATIONS, source.id) ? TRANSLATIONS[source.id][locale] : undefined;
  if (entry === undefined) throw new Error(`fixture card ${source.id} has no ${locale} translation`);
  const used = new Set<string>();

  function fill(key: string, text: LocalizedText, translated: string | undefined): LocalizedText {
    const authored = text[locale];
    if (authored !== undefined && translated !== undefined) {
      throw new Error(`fixture card ${source.id}: ${key} has ${locale} text both in the fixture and in the translation table`);
    }
    if (translated !== undefined) used.add(key);
    const value = authored ?? translated;
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`fixture card ${source.id}: ${key} is missing ${locale} text`);
    return { ...text, [locale]: value };
  }

  const review: Review = source.review.status === 'approved' ? { ...source.review, checks: [...source.review.checks] } : { ...source.review };
  const common = {
    id: source.id,
    topic: source.topic,
    prompt: fill('prompt', source.prompt, entry.prompt),
    explanation: fill('explanation', source.explanation, entry.explanation),
    provenance: { ...source.provenance },
    review,
  };
  let result: Card;
  if (source.type === 'open') {
    result = {
      ...source,
      ...common,
      reference: fill('reference', source.reference, entry.reference),
      checklist: source.checklist.map(
        (item): ChecklistItem => ({ ...item, text: fill(`checklist.${item.id}`, item.text, own(entry.checklist, item.id)) }),
      ),
    };
  } else {
    result = {
      ...source,
      ...common,
      choices: source.choices.map((choice): Choice => {
        const localized: Choice = { ...choice, text: fill(`choices.${choice.id}`, choice.text, own(entry.choices, choice.id)) };
        if (choice.reason !== undefined) localized.reason = fill(`reasons.${choice.id}`, choice.reason, own(entry.reasons, choice.id));
        return localized;
      }),
    };
  }

  const offered = [
    ...(['prompt', 'reference', 'explanation'] as const).filter((field) => entry[field] !== undefined),
    ...Object.keys(entry.checklist ?? {}).map((id) => `checklist.${id}`),
    ...Object.keys(entry.choices ?? {}).map((id) => `choices.${id}`),
    ...Object.keys(entry.reasons ?? {}).map((id) => `reasons.${id}`),
  ];
  for (const key of offered) {
    if (!used.has(key)) throw new Error(`fixture card ${source.id}: ${locale} translation ${key} matches no field of the card`);
  }
  return result as T;
}
