import { Plugin, MarkdownPostProcessorContext } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view'
import '@github/relative-time-element'; // Import to register the custom element

// Regex for MarkdownPostProcessor (checks if an entire <code> block is a timestamp)
// Group 1: The numeric timestamp
const readingViewTimestampRegex = /^<t:(\d+)(?::[tTdDfFR])?>$/;

// Regex for CodeMirror 6 ViewPlugin (targets the *entire* inline code block `timestamp`)
// Group 1: The full <t:...> part (e.g., <t:12345:R>)
// Group 2: The numeric UNIX timestamp (e.g., 12345)
const editorTimestampRegex = /`(<t:(\d+)(?::[tTdDfFR])?>)`/g;


// --- CodeMirror 6 Widget ---
class TimestampWidget extends WidgetType {
	constructor(readonly _fullTimestampString: string, readonly unixTimestamp: number) {
		// _fullTimestampString is the <t:123:R> part, not used in toDOM but good for eq or debugging
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const span = document.createElement('span');
		// This class helps to target the widget specifically in CSS if needed
		// and distinguishes it from the raw <relative-time> if it were used directly.
		span.classList.add('discord-relative-time-widget-wrapper');

		const relativeTimeEl = document.createElement('relative-time');
		const date = new Date(this.unixTimestamp * 1000);
		relativeTimeEl.setAttribute('datetime', date.toISOString());
		relativeTimeEl.classList.add('discord-relative-time'); // Common class for styling

		const titleFormat: Intl.DateTimeFormatOptions = {
			weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
			hour: 'numeric', minute: 'numeric',
		};
		try {
			relativeTimeEl.setAttribute('title', date.toLocaleString(undefined, titleFormat));
		} catch (e) {
			// Fallback for environments where toLocaleString with options might fail
			relativeTimeEl.setAttribute('title', date.toString());
		}

		span.appendChild(relativeTimeEl);
		return span;
	}

	// eq(other: TimestampWidget): boolean {
	//   return other.unixTimestamp === this.unixTimestamp && other._fullTimestampString === this._fullTimestampString;
	// }

	// ignoreEvent(): boolean { // Make the widget non-interactive with mouse/keyboard
	//   return true;
	// }
}

// --- CodeMirror 6 ViewPlugin Logic ---
function buildTimestampDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		let match;
		editorTimestampRegex.lastIndex = 0; // Reset global regex state

		while ((match = editorTimestampRegex.exec(text)) !== null) {
			const matchStartInSlice = match.index;
			const fullMatchedText = match[0]; // The whole ``<t:...>``
			const innerTimestampTag = match[1]; // The `<t:...>` part
			const unixTimestampStr = match[2];  // The numeric timestamp

			const startPos = from + matchStartInSlice;
			const endPos = startPos + fullMatchedText.length;

			const unixTimestamp = parseInt(unixTimestampStr, 10);
			if (!isNaN(unixTimestamp)) {
				builder.add(
					startPos,
					endPos,
					Decoration.replace({
						widget: new TimestampWidget(innerTimestampTag, unixTimestamp),
					})
				);
			}
		}
	}
	return builder.finish();
}

const timestampEditorPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildTimestampDecorations(view);
		}

		update(update: ViewUpdate) {
			// Recompute decorations if document, viewport, or selection changes
			// More specific checks (e.g. only update.docChanged) can be used for performance if needed
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = buildTimestampDecorations(update.view);
			}
		}
	},
	{
		decorations: v => v.decorations,
	}
);


export default class DiscordRelativeTimePlugin extends Plugin {

	async onload() {
		console.log('Loading Discord Relative Time Plugin (Editor + Reading View)');

		// For Reading View: Process <code> elements
		this.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
			this.processTimestampsInReadingView(element, context);
		});

		// For Editing View (Source Mode and Live Preview)
		this.registerEditorExtension(timestampEditorPlugin);
	}

	processTimestampsInReadingView(element: HTMLElement, context: MarkdownPostProcessorContext) {
		const codeElements = element.querySelectorAll('code');

		codeElements.forEach(codeElement => {
			const textContent = codeElement.textContent; // Get the raw text content of the <code> tag
			if (!textContent) return;

			// Check if the *entire* content of the <code> tag matches our timestamp pattern
			const match = textContent.match(readingViewTimestampRegex);

			if (match) {
				// match[0] is the full matched string e.g. <t:1678886400:R>
				// match[1] is the captured UNIX timestamp string
				const timestampSecondsStr = match[1];
				const unixTimestampSeconds = parseInt(timestampSecondsStr, 10);

				if (!isNaN(unixTimestampSeconds)) {
					const date = new Date(unixTimestampSeconds * 1000); // Convert to milliseconds

					const relativeTimeEl = document.createElement('relative-time');
					relativeTimeEl.setAttribute('datetime', date.toISOString());
					relativeTimeEl.classList.add('discord-relative-time'); // For styling

					const titleFormat: Intl.DateTimeFormatOptions = {
						weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
						hour: 'numeric', minute: 'numeric',
					};
					try {
						relativeTimeEl.setAttribute('title', date.toLocaleString(undefined, titleFormat));
					} catch (e) {
						relativeTimeEl.setAttribute('title', date.toString());
					}

					// Replace the content of the <code> element with the new <relative-time>
					codeElement.innerHTML = ''; // Clear existing text node
					codeElement.appendChild(relativeTimeEl);
				}
			}
			// If no match, or timestamp is invalid, the <code> element remains unchanged.
		});
	}

	onunload() {
		console.log('Unloading Discord Relative Time Plugin');
		// Editor extensions and post processors are automatically cleaned up by Obsidian
	}
}
