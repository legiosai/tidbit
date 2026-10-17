# Writing an entry

Tidbit is a glossary of technology concepts for curious people who are not experts: a nurse, a lawyer, a student, a founder. They hear words like GPU, token, S3, HTTPS or Kubernetes and want to actually understand them in five minutes. Every entry is written in English and in Spanish.

An entry is two files:

- `content/entries/<id>.json`: the text, both languages.
- `content/img/<id>.svg`: one illustration, a simple diagram.

`<id>` is `YYYY-MM-DD-slug`: the publication date plus a kebab-case ASCII slug (`2026-10-09-amazon-s3`). The `id` field inside the JSON must equal the file name.

After writing, run `npm run index`. It validates every entry and rebuilds `content/index.json`. Fix whatever it reports.

## The JSON

```json
{
  "id": "2026-10-09-amazon-s3",
  "date": "2026-10-09",
  "subjects": ["aws", "cloud"],
  "level": 1,
  "aliases": { "en": ["S3"], "es": ["S3"] },
  "image": "img/2026-10-09-amazon-s3.svg",
  "imageAlt": { "en": "Buckets holding labeled files", "es": "Baldes con archivos etiquetados" },
  "en": {
    "title": "Amazon S3",
    "tagline": "A giant online drawer for files, rented by the gigabyte.",
    "explanation": ["First paragraph…", "Second paragraph…"],
    "analogy": "A self-storage facility with infinite units…",
    "keyPoints": ["Bucket names are unique across all of AWS.", "…", "…"],
    "links": [{ "label": "What is Amazon S3? (official docs)", "url": "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html" }]
  },
  "es": { "…same fields in Spanish…": "" }
}
```

| Field | Rule |
|---|---|
| `subjects` | 1 or 2 ids from `content/subjects.json`. The main one first. |
| `level` | `1` basic (anyone can read it cold), `2` intermediate (assumes the level 1 terms of its subject), `3` advanced (assumes level 2). |
| `aliases` | Other spellings of the term as it appears in running text, per language: plurals, acronyms, the Spanish name. Used to link the term automatically from other entries. Can be empty arrays. Do not include the title itself. |
| `caseSensitive` | Optional, `true` for proper names that are also everyday words (Meta, Arm, Apple): the automatic links then only match the exact capitalization of the title and aliases. |
| `title` | The concept's name, 1 to 4 words. Keep well-known acronyms as they are (GPU, API, S3). |
| `tagline` | One sentence, under 90 characters, that says what it is in plain words. |
| `explanation` | 2 to 4 paragraphs. Plain language, concrete, no hype. Say what the thing IS, what it is FOR, and why it matters now. Prefer a real example over an abstraction. |
| `analogy` | One everyday analogy, 1 to 3 sentences. |
| `keyPoints` | 3 or 4 one-line facts worth remembering. |
| `links` | 2 or 3 real, stable URLs: official docs, Wikipedia, a canonical explainer. `https` only. Never invent a URL. Spanish entries link the Spanish version of a page when one exists. |

Inline formatting inside `explanation`, `analogy` and `keyPoints`: `**bold**` for the term the first time it appears, `` `code` `` for identifiers, file names and commands. Nothing else: no headings, no lists, no HTML.

Other entries' terms are linked automatically: if an explanation says "runs on a GPU" and there is a GPU entry, the word becomes a link. You do not add links by hand; you make sure the term is spelled the way its entry's title or aliases spell it.

## Voice

- Clear, warm, concrete. Never condescending, never hype. Short sentences.
- No marketing claims, no superlatives you cannot back up, no made-up numbers. If a number is approximate say "roughly".
- English and Spanish are written as native pieces with the same content, not a literal translation.
- Spanish is rioplatense with voseo ("podés", "pensá"), neutral enough for any Spanish speaker. Technical terms that everyone uses in English stay in English (bucket, cluster, deploy).

## The illustration

A whiteboard sketch of the concept, not clip art. Basic shapes only: `rect`, `circle`, `ellipse`, `line`, `path`, `text`, `g`.

- Starts with `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" role="img">` and its first child is the background: `<rect width="400" height="240" rx="16" fill="#f3efe6"/>`. The own background is what makes it look the same in light and dark mode.
- Palette, nothing else: background `#f3efe6`, ink `#2b2b2b`, muted text `#6b6357`, fills `#ffd166` (yellow), `#9bd1b9` (green), `#9ac7ea` (blue), `#f4a7a7` (pink), `#e6dfd0` (sand). Strokes `2` in `#2b2b2b`.
- Labels in English, very short, `font-family="system-ui, sans-serif"`, size 11 to 14, `text-anchor="middle"`, placed so nothing overflows the 400x240 box. Monospace labels (`ui-monospace, Menlo, monospace`) for code-like things.
- No `<script>`, `<image>`, `<foreignObject>`, `<style>`, `<a>`, `<use>` with external refs, no CSS, filters, gradients, event attributes or `href`. Under 6000 characters. Valid XML (`&` written as `&amp;`).

Look at `content/img/2026-10-11-api.svg` and `content/img/2026-10-12-neural-network.svg` for the intended level of detail.

## Subjects

| id | en / es | covers |
|---|---|---|
| `ai` | AI / IA | neural networks, LLMs, Claude, ChatGPT, training, inference, agents, embeddings |
| `aws` | AWS / AWS | S3, EC2, Lambda, IAM, CloudFront, DynamoDB, VPC, SQS, Bedrock |
| `cloud` | Cloud / Cloud | regions, serverless, containers, Kubernetes, CDN, autoscaling, infra as code |
| `hardware` | Hardware / Hardware | CPU, GPU, TPU, RAM, SSD, chips, transistors, ARM vs x86, data centers |
| `software` | Software / Software | APIs, compilers, git, databases, testing, open source, protocols, design patterns |
| `data` | Data / Datos | SQL, data warehouse, ETL, indexes, Parquet, streaming, data lake |
| `security` | Security / Seguridad | encryption, HTTPS, hashing, passwords, 2FA, zero trust, phishing |
| `networks` | Networks / Redes | DNS, TCP/IP, HTTP, latency, Wi-Fi, 5G, VPN, load balancers |
| `companies` | Tech companies / Empresas tech | what NVIDIA, Anthropic, OpenAI, AWS, Google, Apple, TSMC actually do and sell |
