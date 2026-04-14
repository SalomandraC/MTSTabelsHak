import { Node, mergeAttributes } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { RootBlockComponent } from '../ui/root-block-component';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		rootBlock: {
			insertRootBlock: () => ReturnType;
		};
	}
}

export const RootBlock = Node.create({
	name: 'rootblock',
	group: 'rootblock',
	content: 'block',
	draggable: true,
	selectable: true,
	defining: true,

	parseHTML() {
		return [{ tag: 'div[data-type="rootblock"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'rootblock' }), 0];
	},

	addCommands() {
		return {
			insertRootBlock:
				() =>
				({ state, commands }) => {
					const { from, to, empty } = state.selection;
					const rootBlockType = state.schema.nodes[this.name];

					if (!rootBlockType) {
						return false;
					}

					if (!empty) {
						const slice = state.selection.content();
						const rootBlocks: Record<string, unknown>[] = [];

						slice.content.forEach((child) => {
							if (child.type === rootBlockType) {
								child.content.forEach((nestedChild) => {
									if (nestedChild.isBlock) {
										rootBlocks.push({
											type: this.name,
											content: [nestedChild.toJSON() as Record<string, unknown>],
										});
									}
								});
								return;
							}

							if (child.isBlock) {
								rootBlocks.push({
									type: this.name,
									content: [child.toJSON() as Record<string, unknown>],
								});
								return;
							}

							const text = child.textContent;
							if (text) {
								rootBlocks.push({
									type: this.name,
									content: [
										{
											type: 'paragraph',
											content: [{ type: 'text', text }],
										},
									],
								});
							}
						});

						return commands.insertContentAt(
							{ from, to },
							rootBlocks.length > 0
								? rootBlocks
								: [
										{
											type: this.name,
											content: [{ type: 'paragraph' }],
										},
									],
						);
					}

					return commands.insertContent({
						type: this.name,
						content: [{ type: 'paragraph' }],
					});
				},
		};
	},

	addKeyboardShortcuts() {
		const resolveRootBlockContext = () => {
			const { state } = this.editor.view;
			const { selection } = state;

			const { $from } = selection;
			let rootBlockDepth = -1;

			for (let depth = $from.depth; depth > 0; depth -= 1) {
				if ($from.node(depth).type.name === this.name) {
					rootBlockDepth = depth;
					break;
				}
			}

			if (rootBlockDepth < 0) {
				return null;
			}

			const topLevelBlock = $from.node(rootBlockDepth + 1);
			const passthroughTypes = new Set(['bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock']);

			if (passthroughTypes.has(topLevelBlock.type.name)) {
				return null;
			}

			return {
				rootBlockDepth,
			};
		};

		const insertSiblingRootBlock = () => {
			const { state, dispatch } = this.editor.view;
			const { selection } = state;

			if (!selection.empty) {
				return false;
			}

			const context = resolveRootBlockContext();

			if (!context) {
				return false;
			}

			const { $from } = selection;
			const rootBlockType = state.schema.nodes[this.name];
			const paragraphType = state.schema.nodes.paragraph;

			if (!rootBlockType || !paragraphType) {
				return false;
			}

			const paragraph = paragraphType.createAndFill();
			if (!paragraph) {
				return false;
			}

			const insertPos = $from.after(context.rootBlockDepth);
			const newRootBlock = rootBlockType.create(null, [paragraph]);

			let tr = state.tr.insert(insertPos, newRootBlock);
			tr = tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 2))).scrollIntoView();

			dispatch(tr);
			return true;
		};

		return {
			Enter: () => {
				const context = resolveRootBlockContext();

				if (!context) {
					return false;
				}

				return this.editor.commands.setHardBreak();
			},
			'Mod-Enter': () => insertSiblingRootBlock(),
		};
	},

	addNodeView() {
		return ReactNodeViewRenderer(RootBlockComponent);
	},
});
