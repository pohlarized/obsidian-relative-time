import { Plugin, MarkdownPostProcessorContext } from 'obsidian';
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view'
import { RangeSetBuilder, EditorSelection } from '@codemirror/state'; // Added EditorSelection for typing clarity
import '@github/relative-time-element';


// Regex pattern components:
// Date part: YYYY-MM-DD
const rfcDatePart = '\\d{4}-\\d{2}-\\d{2}';
// Time part (optional seconds, optional fractional seconds) and Timezone (Z or +/-HH:MM)
const rfcTimeAndZonePart = 'T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2})';

// Regex for MarkdownPostProcessor:
// Captures date (group 1) and optionally time+zone (group 2)
const readingViewRegex = new RegExp(`^(${rfcDatePart})(${rfcTimeAndZonePart})?$`);

// Regex for CodeMirror 6 ViewPlugin:
// Captures date (group 1) and optionally time+zone (group 2) within backticks
// The full content inside backticks will be `match[1] + (match[2] || '')`
const editorRegex = new RegExp('`(' + rfcDatePart + ')(' + rfcTimeAndZonePart + ')?`', 'g');


// --- CodeMirror 6 Widget ---
class RFC3339Widget extends WidgetType {
	constructor(readonly matchedDateString: string, readonly isDateOnly: boolean) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapperSpan = document.createElement('span');
		wrapperSpan.classList.add('rfc3339-relative-time-widget-wrapper'); // Keep consistent with CSS

		const styledSpan = document.createElement('span');
		styledSpan.classList.add('rfc3339-relative-time-styled-codeblock'); // Keep consistent with CSS

		let processedDateString = this.matchedDateString;
		if (this.isDateOnly) {
			processedDateString += 'T00:00:00Z'; // Normalize date-only to UTC midnight
		}

		const date = new Date(processedDateString);
		if (isNaN(date.getTime())) {
			styledSpan.textContent = this.matchedDateString; // Show original if invalid
			wrapperSpan.appendChild(styledSpan);
			return wrapperSpan;
		}

		const relativeTimeEl = document.createElement('relative-time');
		relativeTimeEl.setAttribute('datetime', date.toISOString());

		let titleString: string;
		if (this.isDateOnly) {
			const titleFormat: Intl.DateTimeFormatOptions = {
				weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
				timeZone: 'UTC', // Display the date as it is (e.g., October 27, 2023)
			};
			titleString = date.toLocaleDateString(undefined, titleFormat);
		} else {
			const titleFormat: Intl.DateTimeFormatOptions = {
				weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
				hour: 'numeric', minute: 'numeric', timeZoneName: 'short',
			};
			titleString = date.toLocaleString(undefined, titleFormat);
		}
		relativeTimeEl.setAttribute('title', titleString);

		styledSpan.appendChild(relativeTimeEl);
		wrapperSpan.appendChild(styledSpan);
		return wrapperSpan;
	}
}

// --- CodeMirror 6 ViewPlugin Logic ---
function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const selection: EditorSelection = view.state.selection;

	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		let match;
		editorRegex.lastIndex = 0; // Reset global regex state

		while ((match = editorRegex.exec(text)) !== null) {
			const fullMarkdownMatch = match[0]; // The whole `DATE_OR_DATETIME`
			const datePart = match[1];         // YYYY-MM-DD
			const timePart = match[2];         // Optional T...Z part

			const fullDateTimeStringInsideBackticks = datePart + (timePart || '');
			const isDateOnly = !timePart;

			const startPos = from + match.index;
			const endPos = startPos + fullMarkdownMatch.length;

			let cursorIsInside = false;
			for (const selRange of selection.ranges) {
				if (selRange.from <= endPos && selRange.to >= startPos) {
					cursorIsInside = true;
					break;
				}
			}

			if (cursorIsInside) {
				continue;
			}

			// Pre-validate by trying to parse the date
			let tempProcessedString = fullDateTimeStringInsideBackticks;
			if (isDateOnly) {
				tempProcessedString += 'T00:00:00Z';
			}
			const dateTest = new Date(tempProcessedString);

			if (!isNaN(dateTest.getTime())) {
				builder.add(
					startPos,
					endPos,
					Decoration.replace({
						widget: new RFC3339Widget(fullDateTimeStringInsideBackticks, isDateOnly),
					})
				);
			}
		}
	}
	return builder.finish();
}

const editorPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{
		decorations: v => v.decorations,
	}
);


export default class RFC3339RelativeTimePlugin extends Plugin { // Name remains RFC3339 as it covers both
	async onload() {
		console.log('Loading RFC3339 Relative Time Plugin (supports date and date-time)');

		this.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
			this.processTimestampsInReadingView(element, context);
		});

		this.registerEditorExtension(editorPlugin);
	}

	processTimestampsInReadingView(element: HTMLElement, context: MarkdownPostProcessorContext) {
		const codeElements = element.querySelectorAll('code');

		codeElements.forEach(codeElement => {
			const textContent = codeElement.textContent;
			if (!textContent) return;

			const match = textContent.match(readingViewRegex);

			if (match) {
				const datePart = match[1];
				const timePart = match[2]; // Will be undefined if only date matched

				const originalMatchedString = datePart + (timePart || '');
				const isDateOnly = !timePart;

				let processedDateString = originalMatchedString;
				if (isDateOnly) {
					processedDateString += 'T00:00:00Z'; // Normalize to UTC midnight
				}

				const date = new Date(processedDateString);

				if (!isNaN(date.getTime())) {
					codeElement.classList.add('rfc3339-relative-time-styled-codeblock');

					const relativeTimeEl = document.createElement('relative-time');
					relativeTimeEl.setAttribute('datetime', date.toISOString());

					let titleString: string;
					if (isDateOnly) {
						const titleFormat: Intl.DateTimeFormatOptions = {
							weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
							timeZone: 'UTC',
						};
						titleString = date.toLocaleDateString(undefined, titleFormat);
					} else {
						const titleFormat: Intl.DateTimeFormatOptions = {
							weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
							hour: 'numeric', minute: 'numeric', timeZoneName: 'short',
						};
						titleString = date.toLocaleString(undefined, titleFormat);
					}
					relativeTimeEl.setAttribute('title', titleString);

					codeElement.innerHTML = '';
					codeElement.appendChild(relativeTimeEl);
				}
			}
		});
	}

	onunload() {
		console.log('Unloading RFC3339 Relative Time Plugin');
	}
}
