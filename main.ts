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

const rfcDatePart = '\\d{4}-\\d{2}-\\d{2}';
const rfcTimeAndZonePart = 'T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2})';
const readingViewRegex = new RegExp(`^(${rfcDatePart})(${rfcTimeAndZonePart})?$`);
const editorRegex = new RegExp('`(' + rfcDatePart + ')(' + rfcTimeAndZonePart + ')?`', 'g');

// --- Helper function for formatting the "datetime" part ---
function formatAbsoluteDateTime(date: Date, isDateOnly: boolean): string {
	const options: Intl.DateTimeFormatOptions = {
		year: 'numeric', month: 'short', day: 'numeric',
		hour: 'numeric', minute: '2-digit', hour12: false,
	};
	if (isDateOnly) {
		return date.toLocaleDateString(undefined, options);
		// For date-only, YYYY-MM-DD is clear and standard
		const year = date.getUTCFullYear();
		const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
		const day = date.getUTCDate().toString().padStart(2, '0');
		return `${year}-${month}-${day}`;
	} else {
		// For date-time, use local time for display, e.g., "Oct 26, 2023, 2:30 PM"
		// Or a more compact local format:
		return date.toLocaleString(undefined, options);
	}
}

// --- CodeMirror 6 Widget ---
class RFC3339Widget extends WidgetType {
	constructor(readonly matchedDateString: string, readonly isDateOnly: boolean) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapperSpan = document.createElement('span');
		wrapperSpan.classList.add('rfc3339-relative-time-widget-wrapper');

		const styledSpan = document.createElement('span');
		styledSpan.classList.add('rfc3339-relative-time-styled-codeblock');

		let processedDateString = this.matchedDateString;
		if (this.isDateOnly) {
			processedDateString += 'T00:00:00Z';
		}

		const date = new Date(processedDateString);
		if (isNaN(date.getTime())) {
			styledSpan.textContent = this.matchedDateString;
			wrapperSpan.appendChild(styledSpan);
			return wrapperSpan;
		}

		// 1. Absolute datetime part
		const absoluteTimeSpan = document.createElement('span');
		absoluteTimeSpan.textContent = formatAbsoluteDateTime(date, this.isDateOnly);

		// 2. Relative time part (within brackets)
		const relativeTimeEl = document.createElement('relative-time');
		relativeTimeEl.setAttribute('datetime', date.toISOString());
		relativeTimeEl.setAttribute('format', 'relative');
		relativeTimeEl.setAttribute('threshold', 'P100Y');
		// Set a comprehensive title on the relative-time element for hover
		const titleFormatOptions: Intl.DateTimeFormatOptions = {
			weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
			hour: this.isDateOnly ? undefined : 'numeric',
			minute: this.isDateOnly ? undefined : '2-digit',
			timeZoneName: this.isDateOnly ? undefined : 'short',
			timeZone: this.isDateOnly ? 'UTC' : undefined, // Display UTC date as-is for date-only
		};
		relativeTimeEl.title = date.toLocaleString(undefined, titleFormatOptions);


		styledSpan.appendChild(absoluteTimeSpan);
		styledSpan.appendChild(document.createTextNode(' (')); // Space and opening bracket
		styledSpan.appendChild(relativeTimeEl);
		styledSpan.appendChild(document.createTextNode(')')); // Closing bracket

		wrapperSpan.appendChild(styledSpan);
		return wrapperSpan;
	}
}

// --- CodeMirror 6 ViewPlugin Logic (buildDecorations) ---
function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const selection: EditorSelection = view.state.selection;

	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		let match;
		editorRegex.lastIndex = 0;

		while ((match = editorRegex.exec(text)) !== null) {
			const fullMarkdownMatch = match[0];
			const datePart = match[1];
			const timePart = match[2];
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
			if (cursorIsInside) continue;

			let tempProcessedString = fullDateTimeStringInsideBackticks;
			if (isDateOnly) tempProcessedString += 'T00:00:00Z';
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
		constructor(view: EditorView) { this.decorations = buildDecorations(view); }
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = buildDecorations(update.view);
			}
		}
	}, { decorations: v => v.decorations }
);

export default class RFC3339RelativeTimePlugin extends Plugin {
	async onload() {
		console.log('Loading RFC3339 Relative Time Plugin (datetime + relative format)');
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
				const timePart = match[2];
				const originalMatchedString = datePart + (timePart || '');
				const isDateOnly = !timePart;
				let processedDateString = originalMatchedString;
				if (isDateOnly) processedDateString += 'T00:00:00Z';
				const date = new Date(processedDateString);

				if (!isNaN(date.getTime())) {
					codeElement.classList.add('rfc3339-relative-time-styled-codeblock');
					codeElement.innerHTML = ''; // Clear existing content

					// 1. Absolute datetime part
					const absoluteTimeSpan = document.createElement('span');
					absoluteTimeSpan.textContent = formatAbsoluteDateTime(date, isDateOnly);

					// 2. Relative time part
					const relativeTimeEl = document.createElement('relative-time');
					relativeTimeEl.setAttribute('datetime', date.toISOString());
					relativeTimeEl.setAttribute('format', 'relative');
					relativeTimeEl.setAttribute('threshold', 'P100Y');
					const titleFormatOptions: Intl.DateTimeFormatOptions = {
						weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
						hour: isDateOnly ? undefined : 'numeric',
						minute: isDateOnly ? undefined : '2-digit',
						timeZoneName: isDateOnly ? undefined : 'short',
						timeZone: isDateOnly ? 'UTC' : undefined,
					};
					relativeTimeEl.title = date.toLocaleString(undefined, titleFormatOptions);

					codeElement.appendChild(absoluteTimeSpan);
					codeElement.appendChild(document.createTextNode(' ('));
					codeElement.appendChild(relativeTimeEl);
					codeElement.appendChild(document.createTextNode(')'));
				}
			}
		});
	}

	onunload() {
		console.log('Unloading RFC3339 Relative Time Plugin');
	}
}
