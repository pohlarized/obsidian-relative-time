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

// Regex for MarkdownPostProcessor (checks if an entire <code> block is a timestamp)
const readingViewTimestampRegex = /^<t:(\d+)(?::[tTdDfFR])?>$/;

// Regex for CodeMirror 6 ViewPlugin (targets the *entire* inline code block `timestamp`)
const editorTimestampRegex = /`(<t:(\d+)(?::[tTdDfFR])?>)`/g;


// --- CodeMirror 6 Widget ---
class TimestampWidget extends WidgetType {
	constructor(readonly _fullTimestampString: string, readonly unixTimestamp: number) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const span = document.createElement('span');
		span.classList.add('discord-relative-time-widget-wrapper');

		const relativeTimeEl = document.createElement('relative-time');
		const date = new Date(this.unixTimestamp * 1000);
		relativeTimeEl.setAttribute('datetime', date.toISOString());
		relativeTimeEl.classList.add('discord-relative-time');

		const titleFormat: Intl.DateTimeFormatOptions = {
			weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
			hour: 'numeric', minute: 'numeric',
		};
		try {
			relativeTimeEl.setAttribute('title', date.toLocaleString(undefined, titleFormat));
		} catch (e) {
			relativeTimeEl.setAttribute('title', date.toString());
		}

		span.appendChild(relativeTimeEl);
		return span;
	}

	// No need for eq or ignoreEvent for this specific behavior,
	// as we are re-evaluating whether to render the widget at all.
}

// --- CodeMirror 6 ViewPlugin Logic ---
function buildTimestampDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const selection: EditorSelection = view.state.selection; // Get the current editor selection

	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		let match;
		editorTimestampRegex.lastIndex = 0;

		while ((match = editorTimestampRegex.exec(text)) !== null) {
			const matchStartInSlice = match.index;
			const fullMatchedText = match[0]; // The whole ``<t:...>``
			const innerTimestampTag = match[1]; // The `<t:...>` part
			const unixTimestampStr = match[2];  // The numeric timestamp

			const startPos = from + matchStartInSlice; // Start of ``<t:...>``
			const endPos = startPos + fullMatchedText.length; // End of ``<t:...>``

			let cursorIsInside = false;
			// Check each selection range (usually just one, the main cursor)
			for (const selRange of selection.ranges) {
				// A cursor is "inside" if its position (selRange.from or selRange.to, which are same for a cursor)
				// is within or at the boundaries of the matched text.
				// A selection block is "inside" if it overlaps with the matched text.
				if (selRange.from <= endPos && selRange.to >= startPos) {
					cursorIsInside = true;
					break; // Found an overlapping selection, no need to check others
				}
			}

			// If cursor is inside the markdown, don't render the widget; show raw text
			if (cursorIsInside) {
				continue; // Skip adding a decoration for this match
			}

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
		console.log('Loading Discord Relative Time Plugin (v1.2 - Editor Cursor Aware)');

		this.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
			this.processTimestampsInReadingView(element, context);
		});

		this.registerEditorExtension(timestampEditorPlugin);
	}

	processTimestampsInReadingView(element: HTMLElement, context: MarkdownPostProcessorContext) {
		const codeElements = element.querySelectorAll('code');
		codeElements.forEach(codeElement => {
			const textContent = codeElement.textContent;
			if (!textContent) return;
			const match = textContent.match(readingViewTimestampRegex);
			if (match) {
				const timestampSecondsStr = match[1];
				const unixTimestampSeconds = parseInt(timestampSecondsStr, 10);
				if (!isNaN(unixTimestampSeconds)) {
					const date = new Date(unixTimestampSeconds * 1000);
					const relativeTimeEl = document.createElement('relative-time');
					relativeTimeEl.setAttribute('datetime', date.toISOString());
					relativeTimeEl.classList.add('discord-relative-time');
					const titleFormat: Intl.DateTimeFormatOptions = {
						weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
						hour: 'numeric', minute: 'numeric',
					};
					try {
						relativeTimeEl.setAttribute('title', date.toLocaleString(undefined, titleFormat));
					} catch (e) {
						relativeTimeEl.setAttribute('title', date.toString());
					}
					codeElement.innerHTML = '';
					codeElement.appendChild(relativeTimeEl);
				}
			}
		});
	}

	onunload() {
		console.log('Unloading Discord Relative Time Plugin');
	}
}
