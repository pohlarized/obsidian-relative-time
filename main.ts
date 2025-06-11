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

// RFC 3339 like pattern. This is a simplified version for common cases.
// It captures: YYYY-MM-DDTHH:mm:ss(.sss optional)(Z or +/-HH:mm timezone)
const rfc3339PatternSrc = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})';

// Regex for MarkdownPostProcessor (checks if an entire <code> block is an RFC 3339 string)
// Group 1: The RFC 3339 datetime string
const readingViewRfc3339Regex = new RegExp(`^(${rfc3339PatternSrc})$`);

// Regex for CodeMirror 6 ViewPlugin (targets an RFC 3339 string within backticks)
// Group 1: The RFC 3339 datetime string (inside the backticks)
const editorRfc3339Regex = new RegExp('`(' + rfc3339PatternSrc + ')`', 'g');


// --- CodeMirror 6 Widget ---
class RFC3339TimestampWidget extends WidgetType {
	constructor(readonly rfc3339String: string) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		// Outer wrapper for CodeMirror, gets general widget class
		const wrapperSpan = document.createElement('span');
		wrapperSpan.classList.add('rfc3339-relative-time-widget-wrapper');

		// Inner span gets the code block styling
		const styledSpan = document.createElement('span');
		styledSpan.classList.add('rfc3339-relative-time-styled-codeblock');

		const date = new Date(this.rfc3339String);
		if (isNaN(date.getTime())) { // Check for invalid date
			// If date is invalid, render the original string as plain text within styled span
			styledSpan.textContent = this.rfc3339String;
			wrapperSpan.appendChild(styledSpan);
			return wrapperSpan;
		}

		const relativeTimeEl = document.createElement('relative-time');
		relativeTimeEl.setAttribute('datetime', date.toISOString());
		// No specific class needed on relative-time itself beyond what @github/relative-time-element provides
		// as styling is handled by its parent .rfc3339-relative-time-styled-codeblock

		const titleFormat: Intl.DateTimeFormatOptions = {
			weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
			hour: 'numeric', minute: 'numeric', timeZoneName: 'short',
		};
		try {
			relativeTimeEl.setAttribute('title', date.toLocaleString(undefined, titleFormat));
		} catch (e) {
			relativeTimeEl.setAttribute('title', date.toString());
		}

		styledSpan.appendChild(relativeTimeEl);
		wrapperSpan.appendChild(styledSpan);
		return wrapperSpan;
	}
}

// --- CodeMirror 6 ViewPlugin Logic ---
function buildRFC3339TimestampDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const selection: EditorSelection = view.state.selection;

	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		let match;
		editorRfc3339Regex.lastIndex = 0; // Reset global regex state

		while ((match = editorRfc3339Regex.exec(text)) !== null) {
			const matchStartInSlice = match.index;
			const fullMatchedText = match[0]; // The whole `RFC3339_STRING`
			const rfc3339String = match[1];  // The captured RFC 3339 string

			const startPos = from + matchStartInSlice;
			const endPos = startPos + fullMatchedText.length;

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

			// Validate the date string before creating a widget
			const dateTest = new Date(rfc3339String);
			if (!isNaN(dateTest.getTime())) {
				builder.add(
					startPos,
					endPos,
					Decoration.replace({
						widget: new RFC3339TimestampWidget(rfc3339String),
					})
				);
			}
		}
	}
	return builder.finish();
}

const rfc3339TimestampEditorPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildRFC3339TimestampDecorations(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = buildRFC3339TimestampDecorations(update.view);
			}
		}
	},
	{
		decorations: v => v.decorations,
	}
);


export default class RFC3339RelativeTimePlugin extends Plugin {

	async onload() {
		console.log('Loading RFC3339 Relative Time Plugin');

		this.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
			this.processTimestampsInReadingView(element, context);
		});

		this.registerEditorExtension(rfc3339TimestampEditorPlugin);
	}

	processTimestampsInReadingView(element: HTMLElement, context: MarkdownPostProcessorContext) {
		const codeElements = element.querySelectorAll('code');

		codeElements.forEach(codeElement => {
			const textContent = codeElement.textContent;
			if (!textContent) return;

			const match = textContent.match(readingViewRfc3339Regex);

			if (match) {
				const rfc3339String = match[1]; // Captured RFC 3339 string
				const date = new Date(rfc3339String);

				if (!isNaN(date.getTime())) { // Check for valid date
					// Apply styling class to the <code> element itself
					codeElement.classList.add('rfc3339-relative-time-styled-codeblock');

					const relativeTimeEl = document.createElement('relative-time');
					relativeTimeEl.setAttribute('datetime', date.toISOString());

					const titleFormat: Intl.DateTimeFormatOptions = {
						weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
						hour: 'numeric', minute: 'numeric', timeZoneName: 'short',
					};
					try {
						relativeTimeEl.setAttribute('title', date.toLocaleString(undefined, titleFormat));
					} catch (e) {
						relativeTimeEl.setAttribute('title', date.toString());
					}

					codeElement.innerHTML = ''; // Clear existing text node
					codeElement.appendChild(relativeTimeEl);
				}
				// If date is invalid, the <code> element remains unchanged, showing the raw RFC string
			}
		});
	}

	onunload() {
		console.log('Unloading RFC3339 Relative Time Plugin');
	}
}
